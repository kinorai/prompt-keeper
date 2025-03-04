#!/usr/bin/env node

const bcrypt = require("bcryptjs");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Enter password to hash: ", async (password) => {
  try {
    // Generate a salt with 10 rounds
    const salt = await bcrypt.genSalt(10);

    // Hash the password with the salt
    const hash = await bcrypt.hash(password, salt);

    console.log("\nHashed Password:");
    console.log(hash);
    console.log("\nAdd this to your .env file as AUTH_PASSWORD_HASH");
  } catch (error) {
    console.error("Error generating hash:", error);
  } finally {
    rl.close();
  }
});
