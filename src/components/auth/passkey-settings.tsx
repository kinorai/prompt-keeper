"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface PasskeyRow {
  id: string;
  name?: string | null;
  deviceType?: string | null;
  createdAt?: string | Date | null;
}

const errorMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const { message } = err as { message?: unknown };
    if (typeof message === "string" && message) return message;
  }
  return fallback;
};

export function PasskeySettings() {
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  // WebAuthn needs a secure context, so over plain http there is nothing to offer
  const [isSupported, setIsSupported] = useState(true);

  const refresh = async () => {
    try {
      const { data, error } = await authClient.passkey.listUserPasskeys();
      if (error) throw error;
      setPasskeys((data as PasskeyRow[]) ?? []);
    } catch (err) {
      toast.error(errorMessage(err, "Could not load passkeys"));
    } finally {
      setIsLoading(false);
    }
  };

  // Support detection and the initial load happen in one pass, after an await, so no state is
  // set synchronously while the effect runs
  useEffect(() => {
    const load = async () => {
      const supported = window.isSecureContext && typeof PublicKeyCredential !== "undefined";
      await refresh();
      setIsSupported(supported);
    };

    void load();
  }, []);

  const handleAdd = async () => {
    setIsAdding(true);
    try {
      const result = await authClient.passkey.addPasskey({ name: `Passkey ${passkeys.length + 1}` });
      if (result?.error) throw result.error;
      toast.success("Passkey added");
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not add a passkey"));
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await authClient.passkey.deletePasskey({ id });
      if (error) throw error;
      toast.success("Passkey removed");
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove the passkey"));
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <Label className="text-sm font-medium">Passkeys</Label>

      {!isSupported && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          Requires HTTPS
        </p>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : passkeys.length === 0 ? (
        <p className="text-xs text-muted-foreground">No passkey yet — add one to sign in without a password.</p>
      ) : (
        <ul className="space-y-1">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
              <Fingerprint className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-xs">{passkey.name || "Passkey"}</span>
              {passkey.createdAt && (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {format(new Date(passkey.createdAt), "dd/MM/yyyy")}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${passkey.name || "passkey"}`}
                onClick={() => handleDelete(passkey.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button variant="outline" size="sm" onClick={handleAdd} disabled={isAdding || !isSupported}>
        {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Fingerprint className="mr-2 h-4 w-4" />}
        Add a passkey
      </Button>
    </div>
  );
}
