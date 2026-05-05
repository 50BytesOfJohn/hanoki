import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

interface ChatEmptyPageProps {
  description: string;
  title: string;
}

export function ChatEmptyPage({ description, title }: ChatEmptyPageProps) {
  return (
    <Empty className="h-full px-6 py-10">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
