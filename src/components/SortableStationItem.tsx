import React, { useState, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Edit,
  Trash2,
  Globe,
  GripVertical,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  RelayStation,
  RelayStationAdapter,
} from '@/lib/api';

interface SortableStationItemProps {
  station: RelayStation;
  getStatusBadge: (station: RelayStation) => React.ReactNode;
  getAdapterDisplayName: (adapter: RelayStationAdapter) => string;
  setSelectedStation: (station: RelayStation) => void;
  setShowEditDialog: (show: boolean) => void;
  openDeleteDialog: (station: RelayStation) => void;
}

/**
 * 可排序的中转站卡片组件
 * @author yovinchen
 */
export const SortableStationItem: React.FC<SortableStationItemProps> = ({
  station,
  getStatusBadge,
  getAdapterDisplayName,
  setSelectedStation,
  setShowEditDialog,
  openDeleteDialog,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: station.id });

  // 展开/收起状态，从 localStorage 读取
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem(`relay-station-expanded-${station.id}`);
    return saved !== null ? JSON.parse(saved) : true; // 默认展开
  });

  // 保存展开状态到 localStorage
  useEffect(() => {
    localStorage.setItem(`relay-station-expanded-${station.id}`, JSON.stringify(isExpanded));
  }, [isExpanded, station.id]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // 是否有详情内容需要显示
  const hasDetails = station.description;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`relative transition-all duration-200 ${
        isDragging
          ? 'shadow-2xl ring-2 ring-blue-500 scale-105 z-50'
          : isOver
            ? 'ring-2 ring-blue-400 ring-offset-2 bg-blue-50 dark:bg-blue-950/50 scale-102'
            : 'hover:shadow-md'
      }`}
    >
      <CardHeader className="pb-2 pt-3 px-3">
        <div className="flex justify-between items-center">
          <div
            className="flex items-center flex-1 min-w-0 mr-2 cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <div className="mr-2 flex-shrink-0">
              <GripVertical className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm font-medium">{station.name}</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {getAdapterDisplayName(station.adapter)}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {getStatusBadge(station)}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isDragging}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedStation(station);
                setShowEditDialog(true);
              }}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-500 hover:text-red-700"
              disabled={isDragging}
              onClick={(e) => {
                e.stopPropagation();
                openDeleteDialog(station);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-1 pb-3 px-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center flex-1 min-w-0">
              <Globe className="mr-1.5 h-3 w-3 flex-shrink-0" />
              <span className="truncate">{station.api_url}</span>
            </div>
            {hasDetails && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="ml-2 p-0.5 hover:bg-accent rounded transition-colors flex-shrink-0"
                aria-label={isExpanded ? "收起详情" : "展开详情"}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>

          {/* 详情内容（可折叠） */}
          {isExpanded && hasDetails && (
            <>
              {station.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {station.description}
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
