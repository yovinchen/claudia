import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { api, type UsageStats, type ProjectUsage } from "@/lib/api";
import { 
  ArrowLeft, 
  TrendingUp, 
  Calendar, 
  Filter,
  Loader2,
  DollarSign,
  Activity,
  FileText,
  Briefcase
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

interface UsageDashboardProps {
  /**
   * Callback when back button is clicked
   */
  onBack: () => void;
}

/**
 * UsageDashboard component - Displays Claude API usage statistics and costs
 * 
 * @example
 * <UsageDashboard onBack={() => setView('welcome')} />
 */
export const UsageDashboard: React.FC<UsageDashboardProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [sessionStats, setSessionStats] = useState<ProjectUsage[] | null>(null);
  const [selectedDateRange, setSelectedDateRange] = useState<"all" | "7d" | "30d">("all");
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    loadUsageStats();
  }, [selectedDateRange]);

  const loadUsageStats = async () => {
    try {
      setLoading(true);
      setError(null);

      let statsData: UsageStats;
      let sessionData: ProjectUsage[];
      
      if (selectedDateRange === "all") {
        statsData = await api.getUsageStats();
        sessionData = await api.getSessionStats();
      } else {
        const days = selectedDateRange === "7d" ? 7 : 30;
        
        // 使用缓存版本的API，传入天数参数
        statsData = await api.getUsageStats(days);
        
        // 对于session数据，继续使用日期范围方式
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const formatDateForApi = (date: Date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}${month}${day}`;
        }

        sessionData = await api.getSessionStats(
            formatDateForApi(startDate),
            formatDateForApi(endDate),
            'desc'
        );
      }
      
      setStats(statsData);
      setSessionStats(sessionData);
    } catch (err) {
      console.error("Failed to load usage stats:", err);
      setError(t('usage.failedToLoadUsageStats'));
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }).format(amount);
  };

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const formatTokens = (num: number): string => {
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(2)}M`;
    } else if (num >= 1_000) {
      return `${(num / 1_000).toFixed(1)}K`;
    }
    return formatNumber(num);
  };

  const getModelDisplayName = (model: string): string => {
    const modelMap: Record<string, string> = {
      "claude-4-opus": "Opus 4",
      "claude-4-sonnet": "Sonnet 4",
      "claude-3.5-sonnet": "Sonnet 3.5",
      "claude-3-opus": "Opus 3",
    };
    return modelMap[model] || model;
  };

  const getModelColor = (model: string): string => {
    if (model.includes("opus")) return "text-purple-500";
    if (model.includes("sonnet")) return "text-blue-500";
    return "text-gray-500";
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">{t('usage.usageDashboardTitle')}</h1>
              <p className="text-xs text-muted-foreground">
                {t('usage.trackUsageAndCosts')}
              </p>
            </div>
          </div>
          
          {/* Date Range Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <div className="flex space-x-1">
              {(["all", "30d", "7d"] as const).map((range) => (
                <Button
                  key={range}
                  variant={selectedDateRange === range ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedDateRange(range)}
                  className="text-xs"
                >
                  {range === "all" ? t('usage.allTime') : range === "7d" ? t('usage.last7Days') : t('usage.last30Days')}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">{t('usage.loadingUsageStats')}</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <p className="text-sm text-destructive mb-4">{error}</p>
              <Button onClick={loadUsageStats} size="sm">
                {t('usage.tryAgain')}
              </Button>
            </div>
          </div>
        ) : stats ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="max-w-6xl mx-auto space-y-6"
          >
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Total Cost Card */}
              <Card className="p-4 shimmer-hover">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('usage.totalCost')}</p>
                    <p className="text-2xl font-bold mt-1">
                      {formatCurrency(stats.total_cost)}
                    </p>
                  </div>
                  <DollarSign className="h-8 w-8 text-muted-foreground/20 rotating-symbol" />
                </div>
              </Card>

              {/* Total Sessions Card */}
              <Card className="p-4 shimmer-hover">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('usage.totalSessions')}</p>
                    <p className="text-2xl font-bold mt-1">
                      {formatNumber(stats.total_sessions)}
                    </p>
                  </div>
                  <FileText className="h-8 w-8 text-muted-foreground/20 rotating-symbol" />
                </div>
              </Card>

              {/* Total Tokens Card */}
              <Card className="p-4 shimmer-hover">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('usage.totalTokens')}</p>
                    <p className="text-2xl font-bold mt-1">
                      {formatTokens(stats.total_tokens)}
                    </p>
                  </div>
                  <Activity className="h-8 w-8 text-muted-foreground/20 rotating-symbol" />
                </div>
              </Card>

              {/* Average Cost per Session Card */}
              <Card className="p-4 shimmer-hover">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('usage.avgCostPerSession')}</p>
                    <p className="text-2xl font-bold mt-1">
                      {formatCurrency(
                        stats.total_sessions > 0 
                          ? stats.total_cost / stats.total_sessions 
                          : 0
                      )}
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-muted-foreground/20 rotating-symbol" />
                </div>
              </Card>
            </div>

            {/* Tabs for different views */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview">{t('usage.overview')}</TabsTrigger>
                <TabsTrigger value="models">{t('usage.byModel')}</TabsTrigger>
                <TabsTrigger value="projects">{t('usage.byProject')}</TabsTrigger>
                <TabsTrigger value="sessions">{t('usage.byDate')}</TabsTrigger>
                <TabsTrigger value="timeline">{t('usage.timeline')}</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4">
                <Card className="p-6">
                  <h3 className="text-sm font-semibold mb-4">{t('usage.tokenBreakdown')}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('usage.inputTokens')}</p>
                      <p className="text-lg font-semibold">{formatTokens(stats.total_input_tokens)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('usage.outputTokens')}</p>
                      <p className="text-lg font-semibold">{formatTokens(stats.total_output_tokens)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('usage.cacheWrite')}</p>
                      <p className="text-lg font-semibold">{formatTokens(stats.total_cache_creation_tokens)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('usage.cacheRead')}</p>
                      <p className="text-lg font-semibold">{formatTokens(stats.total_cache_read_tokens)}</p>
                    </div>
                  </div>
                </Card>

                {/* 使用趋势图表 - 整合了Token使用趋势 */}
                {stats.by_date.length > 1 && (
                  <Card className="p-6">
                    <h3 className="text-sm font-semibold mb-4">{t('usage.dailyUsageOverTime')}</h3>
                    <div className="w-full h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={stats.by_date.slice().reverse().map((day) => ({
                            date: new Date(day.date.replace(/-/g, '/')).toLocaleDateString(undefined, { 
                              month: 'short', 
                              day: 'numeric' 
                            }),
                            cost: day.total_cost,
                            inputTokens: (day.input_tokens || 0) / 1000, // 转换为K
                            outputTokens: (day.output_tokens || 0) / 1000,
                            cacheWriteTokens: (day.cache_creation_tokens || 0) / 1000,
                            cacheReadTokens: (day.cache_read_tokens || 0) / 1000,
                            requests: day.request_count || 0,
                          }))}
                          margin={{ top: 5, right: 80, left: 20, bottom: 40 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/20" />
                          <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 10 }}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                            className="text-muted-foreground"
                          />
                          <YAxis 
                            yAxisId="left"
                            tick={{ fontSize: 10 }}
                            tickFormatter={(value) => `${value}K`}
                            label={{ value: 'Tokens (K)', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }}
                            className="text-muted-foreground"
                          />
                          <YAxis 
                            yAxisId="right"
                            orientation="right"
                            tick={{ fontSize: 10 }}
                            tickFormatter={(value) => `$${value.toFixed(2)}`}
                            label={{ value: 'Cost (USD)', angle: 90, position: 'insideRight', style: { fontSize: 10 } }}
                            className="text-muted-foreground"
                          />
                          <YAxis 
                            yAxisId="requests"
                            orientation="right"
                            tick={{ fontSize: 10 }}
                            tickFormatter={(value) => `${value}`}
                            label={{ value: 'Requests', angle: 90, position: 'insideRight', dx: 40, style: { fontSize: 10 } }}
                            className="text-muted-foreground"
                          />
                          <RechartsTooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--popover))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                              padding: '12px',
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
                              backdropFilter: 'blur(8px)'
                            }}
                            labelStyle={{ 
                              fontSize: 12, 
                              fontWeight: 600, 
                              marginBottom: '8px',
                              color: 'hsl(var(--popover-foreground))'
                            }}
                            itemStyle={{ 
                              fontSize: 11, 
                              padding: '2px 0'
                            }}
                            formatter={(value: any, name: string) => {
                              // 定义线条颜色映射
                              const colorMap: Record<string, string> = {
                                'inputTokens': '#3b82f6',
                                'outputTokens': '#ec4899',
                                'cacheWriteTokens': '#60a5fa',
                                'cacheReadTokens': '#a78bfa',
                                'cost': '#22c55e',
                                'requests': '#f59e0b'
                              };
                              
                              // 获取翻译名称
                              const nameMap: Record<string, string> = {
                                'inputTokens': t('usage.inputTokens'),
                                'outputTokens': t('usage.outputTokens'),
                                'cacheWriteTokens': t('usage.cacheWrite'),
                                'cacheReadTokens': t('usage.cacheRead'),
                                'cost': t('usage.cost'),
                                'requests': t('usage.requests')
                              };
                              
                              // 格式化值
                              let formattedValue = value;
                              if (name === 'cost') {
                                formattedValue = formatCurrency(value);
                              } else if (name.includes('Tokens')) {
                                formattedValue = `${formatTokens(value * 1000)} tokens`;
                              } else if (name === 'requests') {
                                formattedValue = `${value} ${t('usage.times')}`;
                              }
                              
                              // 返回带颜色的格式化内容
                              return [
                                <span style={{ color: colorMap[name] || 'inherit' }}>
                                  {formattedValue}
                                </span>,
                                nameMap[name] || name
                              ];
                            }}
                          />
                          <Legend 
                            wrapperStyle={{ fontSize: 11 }}
                            iconType="line"
                            formatter={(value) => {
                              const nameMap: Record<string, string> = {
                                'inputTokens': t('usage.inputTokens'),
                                'outputTokens': t('usage.outputTokens'),
                                'cacheWriteTokens': t('usage.cacheWrite'),
                                'cacheReadTokens': t('usage.cacheRead'),
                                'cost': t('usage.cost'),
                                'requests': t('usage.requests')
                              };
                              return nameMap[value] || value;
                            }}
                          />
                          
                          {/* Token 线条 - 左轴 */}
                          <Line 
                            yAxisId="left"
                            type="monotone" 
                            dataKey="inputTokens" 
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={{ r: 2 }}
                            activeDot={{ r: 4 }}
                          />
                          <Line 
                            yAxisId="left"
                            type="monotone" 
                            dataKey="outputTokens" 
                            stroke="#ec4899"
                            strokeWidth={2}
                            dot={{ r: 2 }}
                            activeDot={{ r: 4 }}
                          />
                          <Line 
                            yAxisId="left"
                            type="monotone" 
                            dataKey="cacheWriteTokens" 
                            stroke="#60a5fa"
                            strokeWidth={1.5}
                            strokeDasharray="5 5"
                            dot={{ r: 2 }}
                            activeDot={{ r: 4 }}
                          />
                          <Line 
                            yAxisId="left"
                            type="monotone" 
                            dataKey="cacheReadTokens" 
                            stroke="#a78bfa"
                            strokeWidth={1.5}
                            strokeDasharray="5 5"
                            dot={{ r: 2 }}
                            activeDot={{ r: 4 }}
                          />
                          
                          {/* 费用线条 - 右轴 */}
                          <Line 
                            yAxisId="right"
                            type="monotone" 
                            dataKey="cost" 
                            stroke="#22c55e"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                          
                          {/* 请求数线条 - 请求轴 */}
                          <Line 
                            yAxisId="requests"
                            type="monotone" 
                            dataKey="requests" 
                            stroke="#f59e0b"
                            strokeWidth={2}
                            dot={{ r: 2.5 }}
                            activeDot={{ r: 4.5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                )}

                {/* Quick Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="p-6">
                    <h3 className="text-sm font-semibold mb-4">{t('usage.mostUsedModels')}</h3>
                    <div className="space-y-3">
                      {stats.by_model.slice(0, 3).map((model) => (
                        <div key={model.model} className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline" className={cn("text-xs", getModelColor(model.model))}>
                              {getModelDisplayName(model.model)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {model.session_count} {t('usage.sessions')}
                            </span>
                          </div>
                          <span className="text-sm font-medium">
                            {formatCurrency(model.total_cost)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="p-6">
                    <h3 className="text-sm font-semibold mb-4">{t('usage.topProjects')}</h3>
                    <div className="space-y-3">
                      {stats.by_project.slice(0, 3).map((project) => (
                        <div key={project.project_path} className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium truncate max-w-[200px]" title={project.project_path}>
                              {project.project_path}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {project.session_count} {t('usage.sessions')}
                            </span>
                          </div>
                          <span className="text-sm font-medium">
                            {formatCurrency(project.total_cost)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </TabsContent>

              {/* Models Tab */}
              <TabsContent value="models">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* 饼图 */}
                  <Card className="p-6">
                    <h3 className="text-sm font-semibold mb-4">{t('usage.usageByModel')}</h3>
                    <div className="w-full h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stats.by_model.map((model) => ({
                              name: getModelDisplayName(model.model),
                              value: model.total_cost,
                              sessions: model.session_count,
                              tokens: model.total_tokens
                            }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {stats.by_model.map((_, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={['#d97757', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][index % 5]} 
                              />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--popover))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                              padding: '12px',
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
                              backdropFilter: 'blur(8px)'
                            }}
                            labelStyle={{
                              color: 'hsl(var(--popover-foreground))',
                              fontWeight: 600
                            }}
                            itemStyle={{
                              color: 'hsl(var(--popover-foreground))'
                            }}
                            formatter={(value: number, name: string, props: any) => {
                              if (name === 'value') {
                                return [
                                  formatCurrency(value),
                                  `${props.payload.sessions} sessions, ${formatTokens(props.payload.tokens)} tokens`
                                ];
                              }
                              return [value, name];
                            }}
                          />
                          <Legend 
                            verticalAlign="bottom" 
                            height={36}
                            wrapperStyle={{ fontSize: 11 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  {/* 详细列表 */}
                  <Card className="p-6">
                    <h3 className="text-sm font-semibold mb-4">详细统计</h3>
                    <div className="space-y-4">
                      {stats.by_model.map((model) => (
                        <div key={model.model} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <Badge 
                                variant="outline" 
                                className={cn("text-xs", getModelColor(model.model))}
                              >
                                {getModelDisplayName(model.model)}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {model.session_count} {t('usage.sessions')}
                              </span>
                            </div>
                            <span className="text-sm font-semibold">
                              {formatCurrency(model.total_cost)}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">{t('usage.input')}: </span>
                              <span className="font-medium">{formatTokens(model.input_tokens)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">{t('usage.output')}: </span>
                              <span className="font-medium">{formatTokens(model.output_tokens)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Cache W: </span>
                              <span className="font-medium">{formatTokens(model.cache_creation_tokens)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Cache R: </span>
                              <span className="font-medium">{formatTokens(model.cache_read_tokens)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </TabsContent>

              {/* Projects Tab */}
              <TabsContent value="projects">
                <div className="space-y-4">
                  {/* 顶部统计卡片 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('usage.totalProjects')}</p>
                          <p className="text-2xl font-bold mt-1">
                            {stats.by_project.length}
                          </p>
                        </div>
                        <Briefcase className="h-8 w-8 text-muted-foreground/20" />
                      </div>
                    </Card>
                    <Card className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('usage.avgProjectCost')}</p>
                          <p className="text-2xl font-bold mt-1">
                            {formatCurrency(
                              stats.by_project.length > 0 
                                ? stats.by_project.reduce((sum, p) => sum + p.total_cost, 0) / stats.by_project.length
                                : 0
                            )}
                          </p>
                        </div>
                        <DollarSign className="h-8 w-8 text-muted-foreground/20" />
                      </div>
                    </Card>
                    <Card className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('usage.topProjectCost')}</p>
                          <p className="text-2xl font-bold mt-1">
                            {stats.by_project.length > 0 
                              ? formatCurrency(Math.max(...stats.by_project.map(p => p.total_cost)))
                              : '$0.00'}
                          </p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-muted-foreground/20" />
                      </div>
                    </Card>
                  </div>

                  {/* 图表区域 */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* 成本分布饼图 */}
                    <Card className="p-6">
                      <h3 className="text-sm font-semibold mb-4">{t('usage.projectCostDistribution')}</h3>
                      {stats.by_project.length > 0 ? (
                        <div className="w-full h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={stats.by_project.slice(0, 8).map((project) => ({
                                  name: project.project_path.split('/').slice(-2).join('/'),
                                  value: project.total_cost,
                                  sessions: project.session_count,
                                  tokens: project.total_tokens,
                                  fullPath: project.project_path
                                }))}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                              >
                                {stats.by_project.slice(0, 8).map((_, index) => (
                                  <Cell 
                                    key={`cell-${index}`} 
                                    fill={['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16'][index % 8]} 
                                  />
                                ))}
                              </Pie>
                              <RechartsTooltip
                                contentStyle={{ 
                                  backgroundColor: 'hsl(var(--popover))',
                                  border: '1px solid hsl(var(--border))',
                                  borderRadius: '8px',
                                  padding: '12px',
                                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
                                  backdropFilter: 'blur(8px)'
                                }}
                                labelStyle={{
                                  color: 'hsl(var(--popover-foreground))',
                                  fontWeight: 600
                                }}
                                itemStyle={{
                                  color: 'hsl(var(--popover-foreground))'
                                }}
                                formatter={(value: number, name: string, props: any) => {
                                  if (name === 'value') {
                                    return [
                                      formatCurrency(value),
                                      `${props.payload.sessions} ${t('usage.sessions')}, ${formatTokens(props.payload.tokens)} tokens`
                                    ];
                                  }
                                  return [value, name];
                                }}
                              />
                              <Legend 
                                verticalAlign="bottom" 
                                height={36}
                                wrapperStyle={{ fontSize: 10 }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-80 text-muted-foreground">
                          {t('usage.noProjectData')}
                        </div>
                      )}
                    </Card>

                    {/* Token使用柱状图 */}
                    <Card className="p-6">
                      <h3 className="text-sm font-semibold mb-4">{t('usage.projectTokenUsage')}</h3>
                      {stats.by_project.length > 0 ? (
                        <div className="w-full h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={stats.by_project.slice(0, 6).map((project) => ({
                                name: project.project_path.split('/').slice(-1)[0],
                                totalTokens: project.total_tokens / 1000,
                                cost: project.total_cost
                              }))}
                              margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border/20" />
                              <XAxis 
                                dataKey="name"
                                tick={{ fontSize: 10 }}
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                className="text-muted-foreground"
                              />
                              <YAxis 
                                tick={{ fontSize: 10 }}
                                tickFormatter={(value) => `${value}K`}
                                className="text-muted-foreground"
                              />
                              <YAxis 
                                yAxisId="right"
                                orientation="right"
                                tick={{ fontSize: 10 }}
                                tickFormatter={(value) => `$${value.toFixed(2)}`}
                                className="text-muted-foreground"
                              />
                              <RechartsTooltip
                                contentStyle={{ 
                                  backgroundColor: 'hsl(var(--popover))',
                                  border: '1px solid hsl(var(--border))',
                                  borderRadius: '8px',
                                  padding: '12px',
                                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
                                  backdropFilter: 'blur(8px)'
                                }}
                                formatter={(value: number, name: string) => {
                                  if (name === 'totalTokens') {
                                    return `${formatTokens(value * 1000)} tokens`;
                                  } else if (name === 'cost') {
                                    return `$${value.toFixed(2)}`;
                                  }
                                  return value;
                                }}
                              />
                              <Legend 
                                wrapperStyle={{ fontSize: 11 }}
                                formatter={(value) => {
                                  const nameMap: Record<string, string> = {
                                    'totalTokens': t('usage.totalTokens'),
                                    'cost': t('usage.cost')
                                  };
                                  return nameMap[value] || value;
                                }}
                              />
                              <Bar dataKey="totalTokens" fill="#3b82f6" />
                              <Bar dataKey="cost" fill="#ec4899" yAxisId="right" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-80 text-muted-foreground">
                          {t('usage.noProjectData')}
                        </div>
                      )}
                    </Card>
                  </div>

                  {/* 成本排行条形图 */}
                  <Card className="p-6">
                    <h3 className="text-sm font-semibold mb-4">{t('usage.projectCostRanking')}</h3>
                    {stats.by_project.length > 0 && (
                      <div className="w-full h-96 mb-6">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={stats.by_project.slice(0, 10).map((project) => ({
                              name: project.project_path.split('/').slice(-2).join('/'),
                              fullPath: project.project_path,
                              cost: project.total_cost,
                              sessions: project.session_count,
                              tokens: project.total_tokens
                            }))}
                            layout="horizontal"
                            margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border/20" />
                            <XAxis 
                              type="number"
                              tick={{ fontSize: 10 }}
                              tickFormatter={(value) => formatCurrency(value)}
                              className="text-muted-foreground"
                            />
                            <YAxis 
                              type="category"
                              dataKey="name"
                              tick={{ fontSize: 10 }}
                              width={90}
                              className="text-muted-foreground"
                            />
                            <RechartsTooltip
                              contentStyle={{ 
                                backgroundColor: 'hsl(var(--popover))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                                padding: '12px',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
                                backdropFilter: 'blur(8px)',
                                fontSize: 11
                              }}
                              labelStyle={{
                                color: 'hsl(var(--popover-foreground))',
                                fontWeight: 600
                              }}
                              itemStyle={{
                                color: 'hsl(var(--popover-foreground))'
                              }}
                              formatter={(value: number, name: string, props: any) => {
                                if (name === 'cost') {
                                  return [
                                    formatCurrency(value),
                                    `${props.payload.sessions} ${t('usage.sessions')}, ${formatTokens(props.payload.tokens)} tokens`
                                  ];
                                }
                                return [value, name];
                              }}
                              labelFormatter={(label) => `${t('usage.project')}: ${label}`}
                            />
                            <Bar 
                              dataKey="cost" 
                              fill="#3b82f6"
                              radius={[0, 4, 4, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </Card>

                  {/* 详细列表 */}
                  <Card className="p-6">
                    <h3 className="text-sm font-semibold mb-4">{t('usage.projectDetails')}</h3>
                    <div className="space-y-3">
                      {stats.by_project.map((project) => (
                        <div key={project.project_path} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                          <div className="flex flex-col truncate">
                            <span className="text-sm font-medium truncate" title={project.project_path}>
                              {project.project_path}
                            </span>
                            <div className="flex items-center space-x-3 mt-1">
                              <span className="text-xs text-muted-foreground">
                                {project.session_count} {t('usage.sessions')}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatTokens(project.total_tokens)} {t('usage.tokens')}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{formatCurrency(project.total_cost)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(project.total_cost / project.session_count)}/{t('usage.session')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </TabsContent>

              {/* Sessions Tab */}
              <TabsContent value="sessions">
                  <Card className="p-6">
                      <h3 className="text-sm font-semibold mb-4">{t('usage.usageBySession')}</h3>
                      <div className="space-y-3">
                          {sessionStats?.map((session) => (
                              <div key={`${session.project_path}-${session.project_name}`} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                                  <div className="flex flex-col">
                                      <div className="flex items-center space-x-2">
                                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]" title={session.project_path}>
                                            {session.project_path.split('/').slice(-2).join('/')}
                                        </span>
                                      </div>
                                      <span className="text-sm font-medium mt-1">
                                          {session.project_name}
                                      </span>
                                  </div>
                                  <div className="text-right">
                                      <p className="text-sm font-semibold">{formatCurrency(session.total_cost)}</p>
                                      <p className="text-xs text-muted-foreground">
                                          {new Date(session.last_used).toLocaleDateString()}
                                      </p>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </Card>
              </TabsContent>

              {/* Timeline Tab */}
              <TabsContent value="timeline">
                <Card className="p-6">
                  <h3 className="text-sm font-semibold mb-6 flex items-center space-x-2">
                    <Calendar className="h-4 w-4" />
                    <span>{t('usage.dailyUsage')}</span>
                  </h3>
                  {stats.by_date.length > 0 ? (() => {
                    // 准备图表数据
                    const chartData = stats.by_date.slice().reverse().map((day) => {
                      const date = new Date(day.date.replace(/-/g, '/'));
                      return {
                        date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                        fullDate: date.toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric'
                        }),
                        cost: day.total_cost,
                        tokens: day.total_tokens,
                        models: day.models_used.length
                      };
                    });

                    // 自定义Tooltip
                    const CustomTooltip = ({ active, payload }: any) => {
                      if (active && payload && payload[0]) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-background border border-border rounded-lg shadow-lg p-3">
                            <p className="text-sm font-semibold">{data.fullDate}</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              {t('usage.cost')}: {formatCurrency(data.cost)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatTokens(data.tokens)} {t('usage.tokens')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {data.models} {t('usage.models')}{data.models !== 1 ? 's' : ''}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    };

                    return (
                      <div className="w-full h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={chartData}
                            margin={{ top: 10, right: 30, left: 0, bottom: 40 }}
                          >
                            <defs>
                              <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#d97757" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#d97757" stopOpacity={0.1}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                            <XAxis 
                              dataKey="date" 
                              tick={{ fontSize: 11 }}
                              angle={-45}
                              textAnchor="end"
                              height={60}
                              className="text-muted-foreground"
                            />
                            <YAxis 
                              tick={{ fontSize: 11 }}
                              tickFormatter={(value) => formatCurrency(value)}
                              className="text-muted-foreground"
                            />
                            <RechartsTooltip content={<CustomTooltip />} />
                            <Area
                              type="monotone"
                              dataKey="cost"
                              stroke="#d97757"
                              strokeWidth={2}
                              fill="url(#colorCost)"
                              animationDuration={1000}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })() : (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      {t('usage.noUsageData')}
                    </div>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}; 