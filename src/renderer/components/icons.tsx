/*
 * Hand-drawn icons that sit alongside the hugeicons set. Sized in `em` so an
 * unstyled instance still lands near the surrounding text; every real use site
 * either passes a size class or sits inside a frame that applies one.
 */

export function ChatBubbleIcon({ ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M8.5 19.5c-3 0-5.5-2.2-5.5-5.6V9.6C3 6.2 5.5 4 8.5 4h7C18.5 4 21 6.2 21 9.6v4.3c0 3.4-2.5 5.6-5.5 5.6h-.6c-.4 0-.7.2-.9.5l-1.2 1.6c-.5.7-1.4.7-1.9 0l-1.2-1.6c-.2-.3-.6-.5-.9-.5z" />
    </svg>
  );
}
