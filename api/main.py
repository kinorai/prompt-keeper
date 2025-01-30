import asyncio
from fastapi import FastAPI, HTTPException, Security, Depends, Request, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import APIKeyHeader, HTTPBearer, HTTPAuthorizationCredentials
import litellm
from datetime import datetime, UTC, timedelta
import asyncpg
import json
from typing import Optional, Dict, Any, List, Union
from pydantic import BaseModel, Field
from thefuzz import fuzz
from dotenv import load_dotenv
import os
import contextlib
import logging
import secrets

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

litellm.set_verbose = True

# Load .env file
load_dotenv()

# CORS configuration
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
CORS_ORIGINS = [origin.strip() for origin in CORS_ORIGINS]

# Model classes following OpenAI's API structure
class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[Dict[str, str]]
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 1.0
    n: Optional[int] = 1
    stream: bool = False
    max_tokens: Optional[int] = None
    presence_penalty: Optional[float] = 0
    frequency_penalty: Optional[float] = 0
    user: Optional[str] = None

class CompletionRequest(BaseModel):
    model: str
    prompt: Union[str, List[str]]
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 1.0
    n: Optional[int] = 1
    stream: Optional[bool] = True
    max_tokens: Optional[int] = None
    presence_penalty: Optional[float] = 0
    frequency_penalty: Optional[float] = 0
    user: Optional[str] = None

class EmbeddingRequest(BaseModel):
    model: str
    input: Union[str, List[str]]
    user: Optional[str] = None

class ImageGenerationRequest(BaseModel):
    prompt: str
    n: Optional[int] = 1
    size: Optional[str] = "1024x1024"
    response_format: Optional[str] = "url"
    user: Optional[str] = None

class ModerationRequest(BaseModel):
    input: Union[str, List[str]]
    model: Optional[str] = "text-moderation-latest"

class AudioTranscriptionRequest(BaseModel):
    file: UploadFile
    model: str
    prompt: Optional[str] = None
    response_format: Optional[str] = "text"
    temperature: Optional[float] = 0
    language: Optional[str] = None

class AudioSpeechRequest(BaseModel):
    model: str
    input: str
    voice: str = "alloy"
    response_format: Optional[str] = "mp3"
    speed: Optional[float] = 1.0

# Define lifespan first
@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global pool
    pool = await asyncpg.create_pool(
        user=os.getenv("POSTGRES_USER", "prompt_keeper"),
        password=os.getenv("POSTGRES_PASSWORD", "prompt_keeper"),
        database=os.getenv("POSTGRES_DB", "prompt_keeper"),
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432"))
    )
    
    # Create table if it doesn't exist
    async with pool.acquire() as conn:
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS prompt_history (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP WITH TIME ZONE,
                model TEXT,
                messages JSONB,
                response JSONB,
                raw_response JSONB,
                total_tokens INTEGER,
                response_ms INTEGER,
                created INTEGER,
                prompt_tokens INTEGER,
                completion_tokens INTEGER
            )
        ''')
    yield
    # Shutdown
    await pool.close()

# Then create the FastAPI app with lifespan
app = FastAPI(lifespan=lifespan, title="LiteLLM API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection pool
pool = None


# Add after the other environment variables
API_KEY = os.getenv("API_KEY", secrets.token_urlsafe(32))
security = HTTPBearer()

async def verify_api_key(credentials: HTTPAuthorizationCredentials = Security(security)):
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Bearer token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if credentials.credentials != API_KEY:
        raise HTTPException(
            status_code=401,
            detail="Invalid bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials

class ChatRequest(BaseModel):
    model: str
    messages: list[Dict[str, str]]
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = None

class SearchRequest(BaseModel):
    query: str
    limit: Optional[int] = 10
    min_score: Optional[int] = 60
    search_mode: Optional[str] = "fuzzy"  # fuzzy, keyword, regex
    time_range: Optional[str] = "all"  # all, hour, day, week, month, year

async def save_prompt(
    model: str,
    messages: list,
    response: Dict[str, Any],
    raw_response: Dict[str, Any],
    total_tokens: int,
    response_ms: int,
    created: int,
    prompt_tokens: int,
    completion_tokens: int
):
    try:
        # Convert Unix timestamp to timezone-aware datetime
        created_datetime = datetime.fromtimestamp(created, tz=UTC)
        current_time = datetime.now(UTC)
        
        
        # Ensure both datetimes are timezone-aware
        if created_datetime.tzinfo is None:
            created_datetime = created_datetime.replace(tzinfo=UTC)
        if current_time.tzinfo is None:
            current_time = current_time.replace(tzinfo=UTC)
        
        async with pool.acquire() as conn:
            # Create timestamps in UTC for PostgreSQL
            await conn.execute('''
                INSERT INTO prompt_history 
                (timestamp, model, messages, response, raw_response, total_tokens, response_ms, created, prompt_tokens, completion_tokens)
                VALUES ($1::timestamptz, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10)
            ''', current_time, model, json.dumps(messages), 
            json.dumps(response), json.dumps(raw_response), total_tokens, response_ms, 
            created_datetime, prompt_tokens, completion_tokens)
    except Exception as e:
        logger.error(f"Error saving prompt: {str(e)}", exc_info=True)
        logger.error(f"Debug info - created: {created}, created_datetime: {created_datetime}, current_time: {current_time}")

@app.post("/search")
async def search_history(
    request: SearchRequest,
    api_key: str = Depends(verify_api_key)
):
    try:
        start_time = datetime.now()
        async with pool.acquire() as conn:
            # Build the base query
            query = '''
                SELECT timestamp, model, messages, response, raw_response, total_tokens, created, prompt_tokens, completion_tokens, response_ms
                FROM prompt_history
            '''
            
            # Add time filter if specified
            params = []
            if request.time_range != "all":
                query += " WHERE timestamp >= $1"
                time_deltas = {
                    "hour": timedelta(hours=1),
                    "day": timedelta(days=1),
                    "week": timedelta(weeks=1),
                    "month": timedelta(days=30),  # Approximate
                    "year": timedelta(days=365),  # Approximate
                }
                
                if delta := time_deltas.get(request.time_range):
                    current_time = datetime.now(UTC)
                    params.append(current_time - delta)
                    
            # Execute the query with parameters if they exist
            if params:
                rows = await conn.fetch(query, *params)
            else:
                rows = await conn.fetch(query)
                        
            results = []
            for row in rows:
                messages = row['messages']
                if isinstance(messages, str):
                    messages = json.loads(messages)
                
                response = row['response']
                if isinstance(response, str):
                    response = json.loads(response)

                messages_text = " ".join([msg.get('content', '') for msg in messages])
                
                try:
                    response_text = response['choices'][0]['message']['content']
                except (KeyError, IndexError, TypeError):
                    response_text = str(response)
                
                match_score = 0
                
                if request.search_mode == "fuzzy":
                    message_score = fuzz.partial_ratio(request.query.lower(), messages_text.lower())
                    response_score = fuzz.partial_ratio(request.query.lower(), response_text.lower())
                    match_score = max(message_score, response_score)
                elif request.search_mode == "keyword":
                    # Simple keyword search
                    query_words = request.query.lower().split()
                    text = (messages_text + " " + response_text).lower()
                    match_score = sum(1 for word in query_words if word in text) * 100 / len(query_words)
                elif request.search_mode == "regex":
                    import re
                    try:
                        pattern = re.compile(request.query, re.IGNORECASE)
                        matches_messages = bool(pattern.search(messages_text))
                        matches_response = bool(pattern.search(response_text))
                        match_score = 100 if matches_messages or matches_response else 0
                    except re.error:
                        # Invalid regex pattern
                        match_score = 0

                if match_score >= request.min_score:
                    results.append({
                        'timestamp': row['timestamp'].isoformat(),
                        'model': row['model'],
                        'messages': messages,
                        'response': response,
                        'raw_response': json.loads(row['raw_response']) if isinstance(row['raw_response'], str) else row['raw_response'],
                        'total_tokens': row['total_tokens'],
                        'response_ms': row['response_ms'],
                        'created': row['created'],
                        'prompt_tokens': row['prompt_tokens'],
                        'completion_tokens': row['completion_tokens'],
                        'match_score': match_score
                    })

            # Sort by score and limit results
            results.sort(key=lambda x: x['match_score'], reverse=True)
            
            end_time = datetime.now()
            query_time_ms = int((end_time - start_time).total_seconds() * 1000)
            
            return {
                "results": results[:request.limit],
                "total_results": len(results),
                "query_time_ms": query_time_ms
            }
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/models")
async def list_models(
    api_key: str = Depends(verify_api_key)
):
    try:
        # Get models from environment variable
        models_str = os.getenv("AVAILABLE_MODELS", "")
        if not models_str:
            return {
                "object": "list",
                "data": []
            }
        
        # Split models string into list and format response
        models = models_str.split(",")
        formatted_models = []
        for model_id in models:
            model_id = model_id.strip()
            if not model_id:
                continue
                
            # Determine owner based on model prefix
            owned_by = "unknown"
            if model_id.startswith("anthropic/"):
                owned_by = "anthropic"
            elif model_id.startswith("google_genai."):
                owned_by = "google"
            elif model_id.startswith("chatgpt-") or model_id.startswith("o1-"):
                owned_by = "openai"
                
            formatted_models.append({
                "id": model_id,
                "object": "model",
                "created": None,
                "owned_by": owned_by,
            })
        
        return {
            "object": "list",
            "data": formatted_models
        }
    except Exception as e:
        logger.error(f"Error listing models: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/chat/completions")
@app.post("/chat/completions") 
async def chat_completion(
    request: ChatCompletionRequest,
    background_tasks: BackgroundTasks,
    api_key: str = Depends(verify_api_key)
):
    try:
        
        # Get response from LiteLLM with streaming
        response = litellm.completion(
            model=request.model,
            messages=request.messages,
            temperature=request.temperature,
            top_p=request.top_p,
            n=request.n,
            # mock_response="It's simple to use and easy to get started, It's simple to use and easy to get started, It's simple to use and easy to get started, It's simple to use and easy to get started, It's simple to use and easy to get started, It's simple to use and easy to get started",
            stream=request.stream,
            max_tokens=request.max_tokens,
            user=request.user
        )

        # If streaming is requested, we need to accumulate chunks to save the complete response
        if request.stream:
            async def generate():
                chunks = []
                error_occurred = False
                try:
                    for chunk in response:
                        if chunk is None:
                            continue
                        chunks.append(chunk)
                        yield f"data: {json.dumps(chunk.model_dump())}\n\n"
                except Exception as e:
                    error_occurred = True
                    logger.error(f"Error in stream generation: {str(e)}", exc_info=True)
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
                finally:
                    try:
                        # After all chunks are processed, save the complete response
                        if chunks:
                            # Use litellm's stream_chunk_builder to reconstruct the complete response
                            complete_response = litellm.stream_chunk_builder(chunks, messages=request.messages)
                            accumulated_response = {
                                "choices": [{
                                    "message": {
                                        "content": complete_response.choices[0].message.content,
                                        "role": "assistant"
                                    },
                                    "finish_reason": complete_response.choices[0].finish_reason if hasattr(complete_response.choices[0], 'finish_reason') else None
                                }],
                                "model": complete_response.model,
                                "usage": complete_response.usage.model_dump() if complete_response.usage else None,
                                "created": complete_response.created if hasattr(complete_response, 'created') else int(datetime.now(UTC).timestamp())
                            }
                            
                            # Save the complete response
                            asyncio.create_task(save_prompt(
                                model=request.model,
                                messages=request.messages,
                                response=accumulated_response,
                                raw_response=accumulated_response,
                                total_tokens=complete_response.usage.total_tokens if complete_response.usage else 0,
                                response_ms=complete_response.response_ms if hasattr(complete_response, 'response_ms') else 0,
                                created=complete_response.created if hasattr(complete_response, 'created') else int(datetime.now(UTC).timestamp()),
                                prompt_tokens=complete_response.usage.prompt_tokens if complete_response.usage else 0,
                                completion_tokens=complete_response.usage.completion_tokens if complete_response.usage else 0,
                            ))
                    except Exception as e:
                        logger.error(f"Error saving stream response: {str(e)}", exc_info=True)
                    finally:
                        if not error_occurred:
                            yield "data: [DONE]\n\n"

            return StreamingResponse(generate(), media_type="text/event-stream")
        
        # For non-streaming responses, move save_prompt to background task
        response_dict = response.model_dump()
        background_tasks.add_task(
            save_prompt,
            model=request.model,
            messages=request.messages,
            response=response_dict,
            raw_response=response_dict,
            total_tokens=response.usage.total_tokens if response.usage else 0,
            response_ms=response.response_ms if hasattr(response, 'response_ms') else 0,
            created=response.created if hasattr(response, 'created') else int(datetime.now(UTC).timestamp()),
            prompt_tokens=response.usage.prompt_tokens if response.usage else 0,
            completion_tokens=response.usage.completion_tokens if response.usage else 0
        )
        
        return response

    except Exception as e:
        logger.error(f"Error in chat completion: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/completions")
@app.post("/completions")
async def completion(
    request: CompletionRequest,
    api_key: str = Depends(verify_api_key)
):
    try:
        
        # Get response from LiteLLM with streaming
        response = litellm.completion(
            model=request.model,
            prompt=request.prompt,
            temperature=request.temperature,
            top_p=request.top_p,
            n=request.n,
            # mock_response="It's simple to use and easy to get started, It's simple to use and easy to get started, It's simple to use and easy to get started, It's simple to use and easy to get started, It's simple to use and easy to get started, It's simple to use and easy to get started",
            stream=request.stream,
            max_tokens=request.max_tokens,
            user=request.user
        )

        # If streaming is requested, we need to accumulate chunks to save the complete response
        if request.stream:
            async def generate():
                chunks = []
                error_occurred = False
                try:
                    for chunk in response:
                        if chunk is None:
                            continue
                        chunks.append(chunk)
                        yield f"data: {json.dumps(chunk.model_dump())}\n\n"
                except Exception as e:
                    error_occurred = True
                    logger.error(f"Error in stream generation: {str(e)}", exc_info=True)
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
                finally:
                    try:
                        # After all chunks are processed, save the complete response
                        if chunks:
                            # Use litellm's stream_chunk_builder to reconstruct the complete response
                            complete_response = litellm.stream_chunk_builder(chunks, prompt=request.prompt)
                            accumulated_response = {
                                "choices": [{
                                    "text": complete_response.choices[0].text,
                                    "finish_reason": complete_response.choices[0].finish_reason if hasattr(complete_response.choices[0], 'finish_reason') else None
                                }],
                                "model": complete_response.model,
                                "usage": complete_response.usage.model_dump() if complete_response.usage else None,
                                "created": complete_response.created if hasattr(complete_response, 'created') else int(datetime.now(UTC).timestamp())
                            }
                            
                            # Save the complete response
                            asyncio.create_task(save_prompt(
                                model=request.model,
                                messages=[{"role": "user", "content": request.prompt if isinstance(request.prompt, str) else json.dumps(request.prompt)}],
                                response=accumulated_response,
                                raw_response=accumulated_response,
                                total_tokens=complete_response.usage.total_tokens if complete_response.usage else 0,
                                response_ms=complete_response.response_ms if hasattr(complete_response, 'response_ms') else 0,
                                created=complete_response.created if hasattr(complete_response, 'created') else int(datetime.now(UTC).timestamp()),
                                prompt_tokens=complete_response.usage.prompt_tokens if complete_response.usage else 0,
                                completion_tokens=complete_response.usage.completion_tokens if complete_response.usage else 0
                            ))
                    except Exception as e:
                        logger.error(f"Error saving stream response: {str(e)}", exc_info=True)
                    finally:
                        if not error_occurred:
                            yield "data: [DONE]\n\n"

            return StreamingResponse(generate(), media_type="text/event-stream")
        
        # For non-streaming responses, save the complete response directly
        response_dict = response.model_dump()
        asyncio.create_task(save_prompt(
            model=request.model,
            messages=[{"role": "user", "content": request.prompt if isinstance(request.prompt, str) else json.dumps(request.prompt)}],
            response=response_dict,
            raw_response=response_dict,
            total_tokens=response.usage.total_tokens if response.usage else 0,
            response_ms=response.response_ms if hasattr(response, 'response_ms') else 0,
            created=response.created if hasattr(response, 'created') else int(datetime.now(UTC).timestamp()),
            prompt_tokens=response.usage.prompt_tokens if response.usage else 0,
            completion_tokens=response.usage.completion_tokens if response.usage else 0
        ))
        
        return response

    except Exception as e:
        logger.error(f"Error in completion: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/embeddings")
@app.post("/embeddings")
async def create_embedding(
    request: EmbeddingRequest,
    api_key: str = Depends(verify_api_key)
):
    try:
        response = litellm.embedding(
            model=request.model,
            input=request.input,
            user=request.user
        )
        return response
    except Exception as e:
        logger.error(f"Error in embedding: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/images/generations")
@app.post("/images/generations")
async def create_image(
    request: ImageGenerationRequest,
    api_key: str = Depends(verify_api_key)
):
    try:
        response = litellm.image_generation(
            prompt=request.prompt,
            model="dall-e-3",
            n=request.n,
            size=request.size,
            response_format=request.response_format,
            user=request.user
        )
        return response
    except Exception as e:
        logger.error(f"Error in image generation: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/moderations")
@app.post("/moderations")
async def create_moderation(
    request: ModerationRequest,
    api_key: str = Depends(verify_api_key)
):
    try:
        response = litellm.moderation(
            input=request.input,
            model=request.model
        )
        return response
    except Exception as e:
        logger.error(f"Error in moderation: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/audio/transcriptions")
@app.post("/audio/transcriptions")
async def create_transcription(
    file: UploadFile = File(...),
    model: str = Form(...),
    prompt: Optional[str] = Form(None),
    response_format: Optional[str] = Form("text"),
    temperature: Optional[float] = Form(0),
    language: Optional[str] = Form(None),
    api_key: str = Depends(verify_api_key)
):
    try:
        file_content = await file.read()
        response = litellm.audio_transcription(
            file=file_content,
            model=model,
            prompt=prompt,
            response_format=response_format,
            temperature=temperature,
            language=language
        )
        return response
    except Exception as e:
        logger.error(f"Error in transcription: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/audio/speech")
@app.post("/audio/speech")
async def create_speech(
    request: AudioSpeechRequest,
    api_key: str = Depends(verify_api_key)
):
    try:
        response = litellm.audio_speech(
            model=request.model,
            input=request.input,
            voice=request.voice,
            response_format=request.response_format,
            speed=request.speed
        )
        return response
    except Exception as e:
        logger.error(f"Error in speech generation: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
