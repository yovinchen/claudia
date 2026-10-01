import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines multiple class values into a single string using clsx and tailwind-merge.
 * This utility function helps manage dynamic class names and prevents Tailwind CSS conflicts.
 * 
 * @param inputs - Array of class values that can be strings, objects, arrays, etc.
 * @returns A merged string of class names with Tailwind conflicts resolved
 * 
 * @example
 * cn("px-2 py-1", condition && "bg-blue-500", { "text-white": isActive })
 * // Returns: "px-2 py-1 bg-blue-500 text-white" (when condition and isActive are true)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
} 

/**
 * Coerces an untrusted value (e.g. a tool input parsed from Claude's JSONL output)
 * into an array. Claude sometimes emits array parameters as JSON-encoded strings
 * (e.g. TodoWrite `todos: "[{...}]"`), or wraps them in an object. Rendering code
 * must never call `.map` on such values directly.
 */
export function toArray<T = any>(value: unknown, key?: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      return toArray<T>(JSON.parse(trimmed), key);
    } catch {
      return [];
    }
  }
  if (key && value && typeof value === "object" && Array.isArray((value as any)[key])) {
    return (value as any)[key] as T[];
  }
  return [];
}
