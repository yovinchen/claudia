import React from "react";
import { CheckCircle2, Circle, Clock, FileEdit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, toArray } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

interface TodoWidgetProps {
  todos: any[];
  result?: any;
}

export const TodoWidget: React.FC<TodoWidgetProps> = ({ todos: rawTodos, result: _result }) => {
  // todos comes from untrusted tool input; Claude may send it as a JSON string
  const { t } = useTranslation();
  const todos = toArray<any>(rawTodos, "todos").filter((item) => item && typeof item === "object");
  const statusIcons = {
    completed: <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />,
    in_progress: <Clock className="h-4 w-4 text-blue-500 animate-pulse" aria-hidden="true" />,
    pending: <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
  };
  const statusLabels: Record<string, string> = {
    completed: t('widgets.todo.status.completed'),
    in_progress: t('widgets.todo.status.inProgress'),
    pending: t('widgets.todo.status.pending'),
  };
  const priorityLabels: Record<string, string> = {
    high: t('widgets.todo.priority.high'),
    medium: t('widgets.todo.priority.medium'),
    low: t('widgets.todo.priority.low'),
  };

  const priorityColors = {
    high: "bg-red-500/10 text-red-500 border-red-500/20",
    medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    low: "bg-green-500/10 text-green-500 border-green-500/20"
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <FileEdit className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="text-sm font-medium">{t('widgets.todo.title')}</span>
      </div>
      <div className="space-y-2">
        {todos.map((todo, idx) => (
          <div
            key={todo.id || idx}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border bg-card/50",
              todo.status === "completed" && "opacity-60"
            )}
          >
            <div className="mt-0.5">
              {statusIcons[todo.status as keyof typeof statusIcons] || statusIcons.pending}
              <span className="sr-only">{statusLabels[todo.status] || statusLabels.pending}</span>
            </div>
            <div className="flex-1 space-y-1">
              <p className={cn(
                "text-sm",
                todo.status === "completed" && "line-through"
              )}>
                {todo.content}
              </p>
              {todo.priority && (
                <Badge 
                  variant="outline" 
                  className={cn("text-xs", priorityColors[todo.priority as keyof typeof priorityColors])}
                >
                  {priorityLabels[todo.priority] || todo.priority}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};