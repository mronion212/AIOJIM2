import React, { useState } from 'react';
import { MDBListIntegration } from './MDBListIntegration'; // Ensure this path is correct
import { useConfig, CatalogConfig } from '@/contexts/ConfigContext';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Eye, EyeOff, Home, GripVertical } from 'lucide-react';

const sourceBadgeStyles = {
  tmdb: "bg-blue-800/80 text-blue-200 border-blue-600/50 hover:bg-blue-800",
  tvdb: "bg-green-800/80 text-green-200 border-green-600/50 hover:bg-green-800",
  mal: "bg-indigo-800/80 text-indigo-200 border-indigo-600/50 hover:bg-indigo-800",
  mdblist: "bg-yellow-800/80 text-yellow-200 border-yellow-600/50 hover:bg-yellow-800",
};

const SortableCatalogItem = ({ catalog }: { catalog: CatalogConfig & { source?: string }; }) => {
  const { setConfig } = useConfig();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `${catalog.id}-${catalog.type}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 'auto',
  };
  
  const badgeSource = catalog.source || 'custom';
  const badgeStyle = sourceBadgeStyles[badgeSource as keyof typeof sourceBadgeStyles] || "bg-gray-700";

  const handleToggleEnabled = () => {
    setConfig(prev => ({
      ...prev,
      catalogs: prev.catalogs.map(c => {
        if (c.id === catalog.id && c.type === catalog.type) {
          const isNowEnabled = !c.enabled;
          return { ...c, enabled: isNowEnabled, showInHome: isNowEnabled ? c.showInHome : false };
        }
        return c;
      })
    }));
  };

  const handleToggleShowInHome = () => {
    if (!catalog.enabled) return;
    setConfig(prev => ({
      ...prev,
      catalogs: prev.catalogs.map(c =>
        (c.id === catalog.id && c.type === catalog.type) ? { ...c, showInHome: !c.showInHome } : c
      )
    }));
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-4 transition-all duration-200
        ${isDragging ? 'opacity-50 scale-105 shadow-lg' : ''}
        ${!catalog.enabled ? 'opacity-60' : ''}
      `}
    >
      <div className="flex items-center space-x-4">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground p-2 -ml-2 touch-none" aria-label="Drag to reorder">
          <GripVertical />
        </button>
        <div className="flex-shrink-0">
          <Badge variant="outline" className={`font-semibold ${badgeStyle}`}>
            {badgeSource.toUpperCase()}
          </Badge>
        </div>
        <div>
          <p className={`font-medium transition-colors ${catalog.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>{catalog.name}</p>
          <p className={`text-sm transition-colors ${catalog.enabled ? 'text-muted-foreground' : 'text-muted-foreground/50'} capitalize`}>{catalog.type}</p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleToggleEnabled}>
                {catalog.enabled ? (
                  <Eye className="h-5 w-5 text-green-500 dark:text-green-400" />
                ) : (
                  <EyeOff className="h-5 w-5 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>{catalog.enabled ? 'Enabled (Visible)' : 'Disabled'}</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleToggleShowInHome}
                disabled={!catalog.enabled}
                className="disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <Home className={`h-5 w-5 transition-colors ${catalog.showInHome && catalog.enabled ? 'text-blue-500 dark:text-blue-400' : 'text-muted-foreground'}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>{catalog.showInHome && catalog.enabled ? 'Featured on Home Board' : 'Not on Home Board'}</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </Card>
  );
};


// --- The Main Page Component ---
export function CatalogsSettings() {
  const { config, setConfig } = useConfig();
  const [isMdbListOpen, setIsMdbListOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setConfig(prev => {
        const oldIndex = prev.catalogs.findIndex(c => `${c.id}-${c.type}` === active.id);
        const newIndex = prev.catalogs.findIndex(c => `${c.id}-${c.type}` === over.id);
        return { ...prev, catalogs: arrayMove(prev.catalogs, oldIndex, newIndex) };
      });
    }
  };
  
  const catalogItemIds = config.catalogs.map(c => `${c.id}-${c.type}`);

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* --- START: THE NEW, CLEANER HEADER --- */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        
        {/* Left Side: Title, Description, and Legend */}
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">Catalog Management</h2>
          <p className="text-muted-foreground">
            Drag to reorder. Click icons to toggle visibility.
          </p>
          <div className="flex items-center space-x-4 pt-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Eye className="h-4 w-4 text-green-500 dark:text-green-400"/> Enabled
              </div>
              <div className="flex items-center gap-1.5">
                <Home className="h-4 w-4 text-blue-500 dark:text-blue-400"/> On Home Board
              </div>
          </div>
        </div>

        {/* Right Side: Action Button */}
        <div className="flex-shrink-0">
          <Button onClick={() => setIsMdbListOpen(true)}>Manage MDBList Integration</Button>
        </div>

      </div>
      
      {/* The main list of draggable catalogs */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={catalogItemIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {config.catalogs.map(catalog => (
              <SortableCatalogItem key={`${catalog.id}-${catalog.type}`} catalog={catalog} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <MDBListIntegration
        isOpen={isMdbListOpen}
        onClose={() => setIsMdbListOpen(false)}
      />
    </div>
  );
}