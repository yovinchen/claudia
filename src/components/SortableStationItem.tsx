import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Edit,
  Trash2,
  Globe,
  GripVertical,
} from 'lucide-react';
import {
  RelayStation,
  RelayStationAdapter,
  PackycodeUserQuota,
} from '@/lib/api';

interface SortableStationItemProps {
  station: RelayStation;
  getStatusBadge: (station: RelayStation) => React.ReactNode;
  getAdapterDisplayName: (adapter: RelayStationAdapter) => string;
  setSelectedStation: (station: RelayStation) => void;
  setShowEditDialog: (show: boolean) => void;
  openDeleteDialog: (station: RelayStation) => void;
  quotaData: Record<string, PackycodeUserQuota>;
  loadingQuota: Record<string, boolean>;
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
  quotaData,
  loadingQuota,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: station.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style} className="relative">
      <CardHeader className="pb-2 pt-3 px-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center flex-1 min-w-0 mr-2">
            <button
              className="cursor-grab active:cursor-grabbing mr-2 touch-none"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
            </button>
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
          <div className="flex items-center text-xs text-muted-foreground">
            <Globe className="mr-1.5 h-3 w-3" />
            <span className="truncate">{station.api_url}</span>
          </div>

          {station.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {station.description}
            </p>
          )}

          {/* PackyCode 额度显示 */}
          {station.adapter === 'packycode' && (
            <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
              {loadingQuota[station.id] ? (
                <div className="flex items-center justify-center py-1">
                  <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-xs text-muted-foreground">加载中...</span>
                </div>
              ) : quotaData[station.id] ? (
                <div className="space-y-2">
                  {/* 用户信息和计划 */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      {quotaData[station.id].username && (
                        <span className="text-muted-foreground">{quotaData[station.id].username}</span>
                      )}
                      <Badge variant="secondary" className="text-xs h-5 px-1.5">
                        {quotaData[station.id].plan_type.toUpperCase()}
                      </Badge>
                      {quotaData[station.id].opus_enabled && (
                        <Badge variant="default" className="text-xs h-5 px-1.5 bg-purple-600">
                          Opus
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* 账户余额 */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">余额:</span>
                    <span className="font-medium text-blue-600">
                      ${Number(quotaData[station.id].balance_usd).toFixed(2)}
                    </span>
                  </div>

                  {/* 日额度 */}
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">日额度:</span>
                      <div className="flex items-center gap-1">
                        {(() => {
                          const daily_spent = Number(quotaData[station.id].daily_spent_usd);
                          const daily_budget = Number(quotaData[station.id].daily_budget_usd);
                          return (
                            <>
                              <span className={daily_spent > daily_budget * 0.8 ? 'text-orange-600' : 'text-green-600'}>
                                ${daily_spent.toFixed(2)}
                              </span>
                              <span className="text-muted-foreground">/ ${daily_budget.toFixed(2)}</span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          (() => {
                            const daily_spent = Number(quotaData[station.id].daily_spent_usd);
                            const daily_budget = Number(quotaData[station.id].daily_budget_usd);
                            return daily_spent / daily_budget > 0.8;
                          })() ? 'bg-orange-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(
                          (() => {
                            const daily_spent = Number(quotaData[station.id].daily_spent_usd);
                            const daily_budget = Number(quotaData[station.id].daily_budget_usd);
                            return (daily_spent / daily_budget) * 100;
                          })(), 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* 月额度 */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">月额度:</span>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const monthly_spent = Number(quotaData[station.id].monthly_spent_usd);
                          const monthly_budget = Number(quotaData[station.id].monthly_budget_usd);
                          return (
                            <>
                              <span className={monthly_spent > monthly_budget * 0.8 ? 'text-orange-600' : 'text-green-600'}>
                                ${monthly_spent.toFixed(2)}
                              </span>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-muted-foreground">${monthly_budget.toFixed(2)}</span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          (() => {
                            const monthly_spent = Number(quotaData[station.id].monthly_spent_usd);
                            const monthly_budget = Number(quotaData[station.id].monthly_budget_usd);
                            return monthly_spent / monthly_budget > 0.8;
                          })() ? 'bg-orange-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(
                          (() => {
                            const monthly_spent = Number(quotaData[station.id].monthly_spent_usd);
                            const monthly_budget = Number(quotaData[station.id].monthly_budget_usd);
                            return (monthly_spent / monthly_budget) * 100;
                          })(), 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* 总消费 */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                    <span>总消费:</span>
                    <span className="font-medium">${Number(quotaData[station.id].total_spent_usd).toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-center text-muted-foreground py-2">
                  额度信息加载失败
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
