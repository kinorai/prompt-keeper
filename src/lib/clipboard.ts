import { toast } from "sonner";

export const copyToClipboard = async (text: string, successMessage = "Copied to clipboard") => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch (err) {
    console.error("Failed to copy: ", err);
    toast.error("Failed to copy to clipboard");
  }
};
