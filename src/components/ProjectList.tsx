import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { 
  FolderOpen, 
  Calendar, 
  FileText, 
  ChevronRight, 
  Settings,
  MoreVertical,
  Search,
  X,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/hooks/useTranslation";
import type { Project } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/date-utils";
import { Pagination } from "@/components/ui/pagination";

interface ProjectListProps {
  /**
   * Array of projects to display
   */
  projects: Project[];
  /**
   * Callback when a project is clicked
   */
  onProjectClick: (project: Project) => void;
  /**
   * Callback when hooks configuration is clicked
   */
  onProjectSettings?: (project: Project) => void;
  /**
   * Callback when new session button is clicked
   */
  onNewSession?: () => void;
  /**
   * Whether the list is currently loading
   */
  loading?: boolean;
  /**
   * Optional className for styling
   */
  className?: string;
}

const ITEMS_PER_PAGE = 12;

/**
 * Extracts the project name from the full path
 */
const getProjectName = (path: string): string => {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] || path;
};

/**
 * ProjectList component - Displays a paginated list of projects with hover animations
 * 
 * @example
 * <ProjectList
 *   projects={projects}
 *   onProjectClick={(project) => console.log('Selected:', project)}
 * />
 */
export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  onProjectClick,
  onProjectSettings,
  onNewSession,
  className,
}) => {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Sort and filter projects
  const filteredAndSortedProjects = useMemo(() => {
    // First, sort by last_session_time in descending order (newest first)
    let sorted = [...projects].sort((a, b) => b.last_session_time - a.last_session_time);
    
    // Then filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      sorted = sorted.filter(project => 
        getProjectName(project.path).toLowerCase().includes(query)
      );
    }
    
    return sorted;
  }, [projects, searchQuery]);
  
  // Calculate pagination
  const totalPages = Math.ceil(filteredAndSortedProjects.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentProjects = filteredAndSortedProjects.slice(startIndex, endIndex);
  
  // Reset to page 1 if projects or search query changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [projects.length, searchQuery]);
  
  return (
    <div className={cn("space-y-4", className)}>
      {/* Action bar with new session button and search */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        {/* New session button */}
        {onNewSession && (
          <Button
            onClick={onNewSession}
            size="default"
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 lg:w-auto w-full group relative overflow-hidden"
          >
            {/* Gradient overlay effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
            <Plus className="mr-2 h-4 w-4 relative z-10" />
            <span className="relative z-10">{t('newClaudeCodeSession')}</span>
          </Button>
        )}
        
        {/* Search and results info */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 lg:max-w-2xl">
          <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('searchProjects')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9 h-10"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchQuery("")}
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        
          {/* Results info */}
          <div className="text-sm text-muted-foreground whitespace-nowrap">
          {searchQuery ? (
            <span>
              {t('showingResults')}: <span className="font-semibold text-foreground">{filteredAndSortedProjects.length}</span> / {projects.length}
            </span>
          ) : (
            <span>
              {t('totalProjects')}: <span className="font-semibold text-foreground">{projects.length}</span>
            </span>
          )}
          </div>
        </div>
      </div>
      
      {/* Empty state */}
      {filteredAndSortedProjects.length === 0 && searchQuery && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12"
        >
          <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">{t('noSearchResults')}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t('noProjectsMatchSearch')} "{searchQuery}"
          </p>
          <Button
            variant="outline"
            onClick={() => setSearchQuery("")}
          >
            {t('clearSearch')}
          </Button>
        </motion.div>
      )}
      
      {/* Project grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {currentProjects.map((project, index) => (
          <motion.div
            key={project.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              delay: index * 0.05,
              ease: [0.4, 0, 0.2, 1],
            }}
          >
            <Card
              className="p-4 hover:shadow-lg hover:border-primary/50 transition-all duration-200 cursor-pointer group h-full relative overflow-hidden"
              onClick={() => onProjectClick(project)}
            >
              {/* Hover gradient effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              <div className="flex flex-col h-full relative z-10">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <FolderOpen className="h-4 w-4 text-primary" />
                      </div>
                      <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">
                        {getProjectName(project.path)}
                      </h3>
                    </div>
                    {project.sessions.length > 0 && (
                      <Badge variant="secondary" className="shrink-0 ml-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        {project.sessions.length}
                      </Badge>
                    )}
                  </div>
                  
                  <p className="text-xs text-muted-foreground mb-4 font-mono truncate bg-muted/50 rounded px-2 py-1">
                    {project.path}
                  </p>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatTimeAgo(project.created_at * 1000)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      <span>{project.sessions.length}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onProjectSettings && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onProjectSettings(project);
                            }}
                          >
                            <Settings className="h-4 w-4 mr-2" />
                            {t('settings.hooks')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
      
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}; 
