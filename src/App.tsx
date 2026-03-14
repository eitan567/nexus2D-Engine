import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Play, 
  Pause, 
  Square, 
  Layers, 
  Settings, 
  Image as ImageIcon, 
  Box, 
  Trash2, 
  ChevronRight, 
  ChevronDown,
  Move,
  RotateCcw,
  Maximize,
  Smartphone,
  Monitor,
  Save,
  FolderOpen,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Entity, 
  ComponentType, 
  Project, 
  Scene, 
  TransformComponent, 
  SpriteComponent,
  PhysicsComponent,
  Vector2
} from './types';
import { GameEngine } from './engine/Core';

// Initial Project State
const INITIAL_PROJECT: Project = {
  name: "New Mobile Game",
  assets: [],
  activeSceneId: "scene-1",
  controls: {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    up: 'ArrowUp',
    down: 'ArrowDown',
    jump: ' '
  },
  scenes: [
    {
      id: "scene-1",
      name: "Main Scene",
      entities: [
        {
          id: "player",
          name: "Player",
          parent: null,
          children: [],
          components: [
            {
              id: "t1",
              type: ComponentType.Transform,
              enabled: true,
              position: { x: 180, y: 360 },
              rotation: 0,
              scale: { x: 0.5, y: 0.5 }
            },
            {
              id: "s1",
              type: ComponentType.Sprite,
              enabled: true,
              assetId: "",
              color: "#3b82f6",
              opacity: 1,
              flipX: false,
              flipY: false
            },
            {
              id: "p1",
              type: ComponentType.Physics,
              enabled: true,
              mass: 1,
              isStatic: false,
              gravityScale: 1,
              velocity: { x: 0, y: 0 }
            },
            {
              id: "c1",
              type: ComponentType.Collider,
              enabled: true,
              shape: 'box',
              width: 50,
              height: 50,
              radius: 25,
              offsetX: 0,
              offsetY: 0,
              isTrigger: false
            }
          ]
        },
        {
          id: "ground",
          name: "Ground",
          parent: null,
          children: [],
          components: [
            {
              id: "t2",
              type: ComponentType.Transform,
              enabled: true,
              position: { x: 180, y: 650 },
              rotation: 0,
              scale: { x: 4, y: 0.5 }
            },
            {
              id: "s2",
              type: ComponentType.Sprite,
              enabled: true,
              assetId: "",
              color: "#10b981",
              opacity: 1,
              flipX: false,
              flipY: false
            },
            {
              id: "c2",
              type: ComponentType.Collider,
              enabled: true,
              shape: 'box',
              width: 400,
              height: 50,
              radius: 50,
              offsetX: 0,
              offsetY: 0,
              isTrigger: false
            }
          ]
        }
      ]
    }
  ]
};

export default function App() {
  const [project, setProject] = useState<Project>(INITIAL_PROJECT);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<'move' | 'rotate' | 'scale'>('move');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<Vector2>({ x: 0, y: 0 });
  const [initialTransform, setInitialTransform] = useState<{pos: Vector2, rot: number, scale: Vector2} | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [viewportMode, setViewportMode] = useState<'desktop' | 'mobile'>('desktop');
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const activeScene = project.scenes.find(s => s.id === project.activeSceneId)!;
  const selectedEntity = activeScene.entities.find(e => e.id === selectedEntityId);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvasRef.current.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvasRef.current.height;

    // Simple hit detection
    const hit = activeScene.entities.find(entity => {
      const transform = entity.components.find(c => c.type === ComponentType.Transform) as TransformComponent;
      if (!transform) return false;
      const dist = Math.sqrt(Math.pow(transform.position.x - x, 2) + Math.pow(transform.position.y - y, 2));
      return dist < 30; // 30px radius hit area
    });

    if (hit) {
      setSelectedEntityId(hit.id);
      if (isMobile) setRightSidebarOpen(true);
    } else {
      setSelectedEntityId(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPlaying || !selectedEntity || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvasRef.current.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvasRef.current.height;

    const transform = selectedEntity.components.find(c => c.type === ComponentType.Transform) as TransformComponent;
    if (!transform) return;

    // Check if clicking near the entity or its handles
    const dist = Math.sqrt(Math.pow(transform.position.x - x, 2) + Math.pow(transform.position.y - y, 2));
    
    if (dist < 50) { // Simple "near enough" check for now
      setIsDragging(true);
      setDragStartPos({ x, y });
      setInitialTransform({
        pos: { ...transform.position },
        rot: transform.rotation,
        scale: { ...transform.scale }
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !selectedEntity || !initialTransform || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvasRef.current.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvasRef.current.height;

    const dx = x - dragStartPos.x;
    const dy = y - dragStartPos.y;

    const transformComp = selectedEntity.components.find(c => c.type === ComponentType.Transform) as TransformComponent;
    if (!transformComp) return;

    if (transformMode === 'move') {
      updateEntityComponent(selectedEntity.id, transformComp.id, {
        position: { x: initialTransform.pos.x + dx, y: initialTransform.pos.y + dy }
      });
    } else if (transformMode === 'rotate') {
      const angle = Math.atan2(y - initialTransform.pos.y, x - initialTransform.pos.x) * (180 / Math.PI);
      updateEntityComponent(selectedEntity.id, transformComp.id, { rotation: angle });
    } else if (transformMode === 'scale') {
      const scaleX = initialTransform.scale.x + (dx / 100);
      const scaleY = initialTransform.scale.y - (dy / 100);
      updateEntityComponent(selectedEntity.id, transformComp.id, {
        scale: { x: Math.max(0.1, scaleX), y: Math.max(0.1, scaleY) }
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setInitialTransform(null);
  };

  const handleMobileInput = (input: string, value: boolean) => {
    if (engineRef.current) {
      engineRef.current.setInput(input, value);
    }
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setLeftSidebarOpen(false);
        setRightSidebarOpen(false);
      } else {
        setLeftSidebarOpen(true);
        setRightSidebarOpen(true);
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      
      switch(e.key.toLowerCase()) {
        case 'w': setTransformMode('move'); break;
        case 'e': setTransformMode('rotate'); break;
        case 'r': setTransformMode('scale'); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      engineRef.current = new GameEngine(canvasRef.current);
    }
    
    if (engineRef.current) {
      if (isPlaying) {
        engineRef.current.start();
      } else {
        engineRef.current.stop();
      }
      engineRef.current.setProject(project);
      engineRef.current.setSelectedEntity(selectedEntityId, transformMode);
    }
  }, [project, isPlaying, selectedEntityId, transformMode]);

  useEffect(() => {
    if (engineRef.current && canvasRef.current) {
      const width = viewportMode === 'mobile' ? 360 : 1200;
      const height = viewportMode === 'mobile' ? 720 : 800;
      engineRef.current.resize(width, height);
    }
  }, [viewportMode]);

  const updateEntityComponent = (entityId: string, componentId: string, updates: Partial<any>) => {
    setProject(prev => ({
      ...prev,
      scenes: prev.scenes.map(s => s.id === prev.activeSceneId ? {
        ...s,
        entities: s.entities.map(e => e.id === entityId ? {
          ...e,
          components: e.components.map(c => c.id === componentId ? { ...c, ...updates } : c)
        } : e)
      } : s)
    }));
  };

  const removeComponent = (entityId: string, componentId: string) => {
    setProject(prev => ({
      ...prev,
      scenes: prev.scenes.map(s => s.id === prev.activeSceneId ? {
        ...s,
        entities: s.entities.map(e => e.id === entityId ? {
          ...e,
          components: e.components.filter(c => c.id !== componentId)
        } : e)
      } : s)
    }));
  };

  const [componentAccordionStates, setComponentAccordionStates] = useState<Record<string, boolean>>({});

  const toggleComponentAccordion = (componentId: string) => {
    setComponentAccordionStates(prev => ({
      ...prev,
      [componentId]: prev[componentId] === undefined ? false : !prev[componentId]
    }));
  };

  const ComponentAccordion = ({ entityId, component, updateEntityComponent, removeComponent }: { entityId: string, component: any, updateEntityComponent: any, removeComponent: any }) => {
    const isOpen = componentAccordionStates[component.id] !== false;
    return (
      <div className="bg-white/5 rounded-lg border border-white/5 overflow-hidden">
        <div className="px-3 py-2 bg-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleComponentAccordion(component.id)}>
            {isOpen ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
            <span className="text-xs font-bold uppercase tracking-tight">{component.type}</span>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              checked={component.enabled}
              onChange={(e) => updateEntityComponent(entityId, component.id, { enabled: e.target.checked })}
              className="accent-emerald-500"
            />
            <button onClick={() => removeComponent(entityId, component.id)} className="text-gray-500 hover:text-red-500">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {isOpen && (
          <div className="p-4 space-y-4">
            {component.type === ComponentType.Script && (
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase">Script Code</label>
                <textarea 
                  value={(component as ScriptComponent).code}
                  onChange={(e) => updateEntityComponent(entityId, component.id, { code: e.target.value })}
                  className="w-full h-32 bg-[#111] border border-white/5 rounded px-2 py-1 text-xs font-mono"
                  placeholder="// Write your script here..."
                />
              </div>
            )}
            {component.type === ComponentType.Transform && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase">Position X</label>
                    <input 
                      type="number" 
                      value={(component as TransformComponent).position.x}
                      onChange={(e) => updateEntityComponent(entityId, component.id, { position: { ...(component as TransformComponent).position, x: Number(e.target.value) } })}
                      className="w-full bg-[#111] border border-white/5 rounded px-2 py-1 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase">Position Y</label>
                    <input 
                      type="number" 
                      value={(component as TransformComponent).position.y}
                      onChange={(e) => updateEntityComponent(entityId, component.id, { position: { ...(component as TransformComponent).position, y: Number(e.target.value) } })}
                      className="w-full bg-[#111] border border-white/5 rounded px-2 py-1 text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 uppercase">Rotation</label>
                  <input 
                    type="range" 
                    min="0" max="360"
                    value={(component as TransformComponent).rotation}
                    onChange={(e) => updateEntityComponent(entityId, component.id, { rotation: Number(e.target.value) })}
                    className="w-full accent-emerald-500"
                  />
                </div>
              </>
            )}
            {component.type === ComponentType.Sprite && (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 uppercase">Image Asset</label>
                  <select 
                    value={(component as SpriteComponent).assetId}
                    onChange={(e) => updateEntityComponent(entityId, component.id, { assetId: e.target.value })}
                    className="w-full bg-[#111] border border-white/5 rounded px-2 py-1 text-xs"
                  >
                    <option value="">None (Color Block)</option>
                    {project.assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 uppercase">Color / Tint</label>
                  <div className="flex gap-2">
                    <input 
                      type="color" 
                      value={(component as SpriteComponent).color}
                      onChange={(e) => updateEntityComponent(entityId, component.id, { color: e.target.value })}
                      className="w-10 h-8 bg-transparent border-none cursor-pointer"
                    />
                    <input 
                      type="text" 
                      value={(component as SpriteComponent).color}
                      onChange={(e) => updateEntityComponent(entityId, component.id, { color: e.target.value })}
                      className="flex-1 bg-[#111] border border-white/5 rounded px-2 py-1 text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 uppercase">Opacity</label>
                  <input 
                    type="range" 
                    min="0" max="1" step="0.1"
                    value={(component as SpriteComponent).opacity}
                    onChange={(e) => updateEntityComponent(entityId, component.id, { opacity: Number(e.target.value) })}
                    className="w-full accent-emerald-500"
                  />
                </div>
              </>
            )}
            {component.type === ComponentType.Physics && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase">Mass</label>
                    <input 
                      type="number" 
                      value={(component as PhysicsComponent).mass}
                      onChange={(e) => updateEntityComponent(entityId, component.id, { mass: Number(e.target.value) })}
                      className="w-full bg-[#111] border border-white/5 rounded px-2 py-1 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase">Gravity Scale</label>
                    <input 
                      type="number" 
                      value={(component as PhysicsComponent).gravityScale}
                      onChange={(e) => updateEntityComponent(entityId, component.id, { gravityScale: Number(e.target.value) })}
                      className="w-full bg-[#111] border border-white/5 rounded px-2 py-1 text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    checked={(component as PhysicsComponent).isStatic}
                    onChange={(e) => updateEntityComponent(entityId, component.id, { isStatic: e.target.checked })}
                    className="accent-emerald-500"
                  />
                  <label className="text-[10px] text-gray-500 uppercase">Is Static</label>
                </div>
              </>
            )}
            {component.type === ComponentType.Collider && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase">Shape</label>
                    <select 
                      value={(component as any).shape}
                      onChange={(e) => updateEntityComponent(entityId, component.id, { shape: e.target.value })}
                      className="w-full bg-[#111] border border-white/5 rounded px-2 py-1 text-xs"
                    >
                      <option value="box">Box</option>
                      <option value="circle">Circle</option>
                    </select>
                  </div>
                  <div className="space-y-1 mt-4">
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        checked={(component as any).isTrigger}
                        onChange={(e) => updateEntityComponent(entityId, component.id, { isTrigger: e.target.checked })}
                        className="accent-emerald-500"
                      />
                      <label className="text-[10px] text-gray-500 uppercase">Is Trigger</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        checked={(component as any).isPassThrough}
                        onChange={(e) => updateEntityComponent(entityId, component.id, { isPassThrough: e.target.checked })}
                        className="accent-emerald-500"
                      />
                      <label className="text-[10px] text-gray-500 uppercase">Is Pass-Through</label>
                    </div>
                  </div>
                </div>
                {(component as any).shape === 'box' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-500 uppercase">Width</label>
                      <input 
                        type="number" 
                        value={(component as any).width}
                        onChange={(e) => updateEntityComponent(entityId, component.id, { width: Number(e.target.value) })}
                        className="w-full bg-[#111] border border-white/5 rounded px-2 py-1 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-500 uppercase">Height</label>
                      <input 
                        type="number" 
                        value={(component as any).height}
                        onChange={(e) => updateEntityComponent(entityId, component.id, { height: Number(e.target.value) })}
                        className="w-full bg-[#111] border border-white/5 rounded px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase">Radius</label>
                    <input 
                      type="number" 
                      value={(component as any).radius}
                      onChange={(e) => updateEntityComponent(entityId, component.id, { radius: Number(e.target.value) })}
                      className="w-full bg-[#111] border border-white/5 rounded px-2 py-1 text-xs"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase">Offset X</label>
                    <input 
                      type="number" 
                      value={(component as any).offsetX}
                      onChange={(e) => updateEntityComponent(entityId, component.id, { offsetX: Number(e.target.value) })}
                      className="w-full bg-[#111] border border-white/5 rounded px-2 py-1 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase">Offset Y</label>
                    <input 
                      type="number" 
                      value={(component as any).offsetY}
                      onChange={(e) => updateEntityComponent(entityId, component.id, { offsetY: Number(e.target.value) })}
                      className="w-full bg-[#111] border border-white/5 rounded px-2 py-1 text-xs"
                    />
                  </div>
                </div>
                <button 
                  className="w-full py-1.5 mt-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs text-gray-300 transition-colors"
                  onClick={() => {
                    const transform = selectedEntity.components.find(c => c.type === ComponentType.Transform) as TransformComponent;
                    if (transform) {
                      updateEntityComponent(entityId, component.id, {
                        width: transform.scale.x * 100,
                        height: transform.scale.y * 100,
                        radius: Math.max(transform.scale.x, transform.scale.y) * 50,
                        offsetX: 0,
                        offsetY: 0
                      });
                    }
                  }}
                >
                  Auto-Fit to Sprite
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const addEntity = () => {
    const newEntity: Entity = {
      id: `entity-${Date.now()}`,
      name: "New Entity",
      parent: null,
      children: [],
      components: [
        {
          id: `t-${Date.now()}`,
          type: ComponentType.Transform,
          enabled: true,
          position: { x: 400, y: 300 },
          rotation: 0,
          scale: { x: 1, y: 1 }
        },
        {
          id: `s-${Date.now()}`,
          type: ComponentType.Sprite,
          enabled: true,
          assetId: "",
          color: "#ef4444",
          opacity: 1,
          flipX: false,
          flipY: false
        },
        {
          id: `c-${Date.now()}`,
          type: ComponentType.Collider,
          enabled: true,
          shape: 'box',
          width: 100,
          height: 100,
          radius: 50,
          offsetX: 0,
          offsetY: 0,
          isTrigger: false
        }
      ]
    };

    setProject(prev => ({
      ...prev,
      scenes: prev.scenes.map(s => s.id === prev.activeSceneId ? {
        ...s,
        entities: [...s.entities, newEntity]
      } : s)
    }));
    setSelectedEntityId(newEntity.id);
  };

  const deleteEntity = (id: string) => {
    setProject(prev => ({
      ...prev,
      scenes: prev.scenes.map(s => s.id === prev.activeSceneId ? {
        ...s,
        entities: s.entities.filter(e => e.id !== id)
      } : s)
    }));
    if (selectedEntityId === id) setSelectedEntityId(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const newAsset = {
        id: `asset-${Date.now()}`,
        name: file.name,
        type: 'image' as const,
        url: dataUrl
      };
      
      setProject(prev => ({
        ...prev,
        assets: [...prev.assets, newAsset]
      }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col h-screen bg-[#1a1a1a] text-gray-300 font-sans overflow-hidden">
      {/* Top Toolbar */}
      <header className={`border-b border-white/10 flex items-center justify-between px-4 bg-[#252525] z-50 transition-all ${isMobile ? 'h-10 px-2' : 'h-12'}`}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-emerald-500 font-bold tracking-tighter text-xl">
            <Box size={isMobile ? 18 : 24} />
            {!isMobile && <span>NEXUS 2D</span>}
          </div>
          {!isMobile && <div className="h-4 w-px bg-white/10 mx-2" />}
          <div className="flex items-center gap-1">
            <button className="p-1.5 hover:bg-white/5 rounded transition-colors" title="Save Project">
              <Save size={isMobile ? 14 : 18} />
            </button>
            <button className="p-1.5 hover:bg-white/5 rounded transition-colors" title="Open Project">
              <FolderOpen size={isMobile ? 14 : 18} />
            </button>
          </div>
        </div>

        <div className={`flex items-center gap-2 bg-[#1a1a1a] rounded-full border border-white/5 shadow-inner transition-all ${isMobile ? 'px-2 py-0.5' : 'px-4 py-1'}`}>
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-1 rounded-full transition-all ${isPlaying ? 'text-amber-500 bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
          >
            {isPlaying ? <Pause size={isMobile ? 16 : 20} fill="currentColor" /> : <Play size={isMobile ? 16 : 20} fill="currentColor" />}
          </button>
          <button 
            onClick={() => setIsPlaying(false)}
            className="p-1 text-red-500 hover:bg-red-500/10 rounded-full transition-all"
          >
            <Square size={isMobile ? 16 : 20} fill="currentColor" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-[#1a1a1a] rounded-lg p-1 border border-white/5">
            <button 
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
              className={`p-1 rounded transition-colors ${leftSidebarOpen ? 'text-emerald-500 bg-emerald-500/10' : 'text-gray-500 hover:bg-white/5'}`}
              title="Toggle Hierarchy"
            >
              <Layers size={isMobile ? 14 : 16} />
            </button>
            <button 
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              className={`p-1 rounded transition-colors ${rightSidebarOpen ? 'text-emerald-500 bg-emerald-500/10' : 'text-gray-500 hover:bg-white/5'}`}
              title="Toggle Inspector"
            >
              <Settings size={isMobile ? 14 : 16} />
            </button>
          </div>
          
          <div className="flex bg-[#1a1a1a] rounded-lg p-1 border border-white/5">
            <button 
              onClick={() => setViewportMode('desktop')}
              className={`p-1 rounded transition-colors ${viewportMode === 'desktop' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
              title="Desktop View"
            >
              <Monitor size={isMobile ? 14 : 16} />
            </button>
            <button 
              onClick={() => setViewportMode('mobile')}
              className={`p-1 rounded transition-colors ${viewportMode === 'mobile' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
              title="Mobile View"
            >
              <Smartphone size={isMobile ? 14 : 16} />
            </button>
          </div>

          <button className={`hover:bg-white/5 rounded-lg transition-colors ${isMobile ? 'p-1' : 'p-2'}`} onClick={() => setShowControls(true)}>
            <Settings size={isMobile ? 16 : 20} />
          </button>

          {showControls && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
              <div className="bg-[#252525] p-6 rounded-xl border border-white/10 w-96 space-y-4">
                <h2 className="text-lg font-bold">Controls Settings</h2>
                {Object.entries(project.controls).map(([action, key]) => (
                  <div key={action} className="flex items-center justify-between">
                    <label className="text-sm capitalize">{action}</label>
                    <select 
                      value={key}
                      onChange={(e) => setProject(prev => ({ ...prev, controls: { ...prev.controls, [action]: e.target.value } }))}
                      className="bg-[#111] border border-white/5 rounded px-2 py-1 text-xs w-32"
                    >
                      <option value="ArrowLeft">Arrow Left</option>
                      <option value="ArrowRight">Arrow Right</option>
                      <option value="ArrowUp">Arrow Up</option>
                      <option value="ArrowDown">Arrow Down</option>
                      <option value=" ">Space</option>
                      <option value="w">W</option>
                      <option value="a">A</option>
                      <option value="s">S</option>
                      <option value="d">D</option>
                    </select>
                  </div>
                ))}
                <button onClick={() => setShowControls(false)} className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 rounded text-sm font-bold">Close</button>
              </div>
            </div>
          )}

          {!isMobile && (
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-black font-bold text-xs">
              EA
            </div>
          )}
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        {/* Mobile Backdrop */}
        <AnimatePresence>
          {isMobile && (leftSidebarOpen || rightSidebarOpen) && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setLeftSidebarOpen(false);
                setRightSidebarOpen(false);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30"
            />
          )}
        </AnimatePresence>

        {/* Left Sidebar: Hierarchy & Assets */}
        <AnimatePresence initial={false}>
          {leftSidebarOpen && (
            <motion.aside 
              initial={{ x: -256, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -256, opacity: 0 }}
              className={`border-r border-white/10 bg-[#252525] flex flex-col overflow-hidden z-40 ${isMobile ? 'absolute inset-y-0 left-0 w-64 shadow-2xl' : 'relative w-64'}`}
            >
              <div className="w-64 flex flex-col h-full">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-3 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <Layers size={14} />
                <span>Hierarchy</span>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={addEntity}
                  className="p-1 hover:bg-emerald-500/20 text-emerald-500 rounded transition-colors"
                >
                  <Plus size={16} />
                </button>
                {isMobile && (
                  <button 
                    onClick={() => setLeftSidebarOpen(false)}
                    className="p-1 hover:bg-white/10 text-gray-400 rounded transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {activeScene.entities.map(entity => (
                <div 
                  key={entity.id}
                  onClick={() => setSelectedEntityId(entity.id)}
                  className={`group flex items-center justify-between px-3 py-1.5 rounded cursor-pointer transition-all ${selectedEntityId === entity.id ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'hover:bg-white/5 text-gray-400'}`}
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight size={14} className={selectedEntityId === entity.id ? 'text-emerald-500' : 'text-gray-600'} />
                    <Box size={14} />
                    <span className="text-sm truncate max-w-[120px]">{entity.name}</span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteEntity(entity.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="h-1/3 border-t border-white/10 flex flex-col min-h-0">
            <div className="p-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-white/5">
              <FolderOpen size={14} />
              <span>Assets</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3">
              <div className="aspect-square rounded-lg border-2 border-dashed border-white/5 flex flex-col items-center justify-center gap-2 hover:border-emerald-500/30 hover:bg-emerald-500/5 cursor-pointer transition-all group relative">
                <input 
                  type="file" 
                  accept="image/*" 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                  onChange={handleFileUpload} 
                  title="Import Image"
                />
                <Plus size={20} className="text-gray-600 group-hover:text-emerald-500" />
                <span className="text-[10px] text-gray-600 group-hover:text-emerald-500 uppercase font-bold">Import</span>
              </div>
              {project.assets.map(asset => (
                <div key={asset.id} className="aspect-square rounded-lg bg-white/5 border border-white/10 p-2 flex flex-col items-center justify-center gap-1 hover:border-emerald-500/30 cursor-pointer">
                  {asset.type === 'image' ? (
                    <img src={asset.url} alt={asset.name} className="w-8 h-8 object-contain" />
                  ) : (
                    <ImageIcon size={20} className="text-gray-500" />
                  )}
                  <span className="text-[10px] truncate w-full text-center">{asset.name}</span>
                </div>
              ))}
            </div>
          </div>
          </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Viewport */}
        <section className="flex-1 bg-[#111] relative flex flex-col overflow-hidden">
          {/* Scene Tabs */}
          <div className="h-9 bg-[#1a1a1a] border-b border-white/5 flex items-center px-2 gap-1">
            {project.scenes.map(scene => (
              <div 
                key={scene.id}
                className={`h-full px-4 flex items-center gap-2 text-[11px] font-medium cursor-pointer transition-all border-r border-white/5 ${project.activeSceneId === scene.id ? 'bg-[#252525] text-emerald-500 border-t-2 border-t-emerald-500' : 'text-gray-500 hover:bg-white/5'}`}
              >
                <Box size={12} />
                <span>{scene.name}.scene</span>
              </div>
            ))}
            <button className="p-1.5 text-gray-600 hover:text-emerald-500 transition-colors">
              <Plus size={14} />
            </button>
          </div>

          <div className="flex-1 relative flex items-center justify-center p-8">
            <div className="absolute top-4 left-4 flex gap-2 z-10">
            <div className="px-3 py-1 bg-black/50 backdrop-blur-md rounded-full border border-white/10 text-[10px] font-mono text-emerald-500">
              FPS: 60
            </div>
            <div className="px-3 py-1 bg-black/50 backdrop-blur-md rounded-full border border-white/10 text-[10px] font-mono text-gray-400 uppercase">
              {viewportMode} Mode
            </div>
          </div>

          <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
            <button 
              onClick={() => setTransformMode('move')}
              className={`p-2 backdrop-blur-md rounded-lg border transition-all ${transformMode === 'move' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'bg-black/50 border-white/10 text-gray-400 hover:bg-white/10'}`}
              title="Move Tool (W)"
            >
              <Move size={18} />
            </button>
            <button 
              onClick={() => setTransformMode('rotate')}
              className={`p-2 backdrop-blur-md rounded-lg border transition-all ${transformMode === 'rotate' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'bg-black/50 border-white/10 text-gray-400 hover:bg-white/10'}`}
              title="Rotate Tool (E)"
            >
              <RotateCcw size={18} />
            </button>
            <button 
              onClick={() => setTransformMode('scale')}
              className={`p-2 backdrop-blur-md rounded-lg border transition-all ${transformMode === 'scale' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'bg-black/50 border-white/10 text-gray-400 hover:bg-white/10'}`}
              title="Scale Tool (R)"
            >
              <Maximize size={18} />
            </button>
          </div>

          <motion.div 
            layout
            className={`bg-black shadow-2xl border border-white/10 overflow-hidden relative transition-all duration-500 flex items-center justify-center ${viewportMode === 'mobile' ? 'w-[280px] h-[560px] aspect-[9/18] rounded-[40px] border-[12px] border-[#222] ring-4 ring-white/5' : 'w-full h-full rounded-lg'}`}
          >
            <canvas 
              ref={canvasRef}
              onClick={handleCanvasClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              width={viewportMode === 'mobile' ? 360 : 1200}
              height={viewportMode === 'mobile' ? 720 : 800}
              className="max-w-full max-h-full object-contain cursor-crosshair"
            />
            {viewportMode === 'mobile' && (
              <>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-[#222] rounded-b-2xl z-20 flex items-center justify-center">
                  <div className="w-8 h-1 bg-white/10 rounded-full" />
                </div>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-20 h-1 bg-white/20 rounded-full z-20" />
              </>
            )}
            
            {/* Mobile Controls Overlay */}
            {viewportMode === 'mobile' && isPlaying && (
              <div className="absolute inset-0 pointer-events-none flex flex-col justify-end p-6 pb-12">
                <div className="flex justify-between items-end">
                  <div className="w-20 h-20 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center pointer-events-auto relative">
                    <button 
                      onMouseDown={() => handleMobileInput('left', true)}
                      onMouseUp={() => handleMobileInput('left', false)}
                      onTouchStart={() => handleMobileInput('left', true)}
                      onTouchEnd={() => handleMobileInput('left', false)}
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-white/30"
                    >
                      <ChevronRight className="rotate-180" size={20} />
                    </button>
                    <button 
                      onMouseDown={() => handleMobileInput('right', true)}
                      onMouseUp={() => handleMobileInput('right', false)}
                      onTouchStart={() => handleMobileInput('right', true)}
                      onTouchEnd={() => handleMobileInput('right', false)}
                      className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-white/30"
                    >
                      <ChevronRight size={20} />
                    </button>
                    <button 
                      onMouseDown={() => handleMobileInput('up', true)}
                      onMouseUp={() => handleMobileInput('up', false)}
                      onTouchStart={() => handleMobileInput('up', true)}
                      onTouchEnd={() => handleMobileInput('up', false)}
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-8 flex items-center justify-center text-white/30"
                    >
                      <ChevronRight className="-rotate-90" size={20} />
                    </button>
                    <button 
                      onMouseDown={() => handleMobileInput('down', true)}
                      onMouseUp={() => handleMobileInput('down', false)}
                      onTouchStart={() => handleMobileInput('down', true)}
                      onTouchEnd={() => handleMobileInput('down', false)}
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-8 flex items-center justify-center text-white/30"
                    >
                      <ChevronRight className="rotate-90" size={20} />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-emerald-500/50 border border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]" />
                  </div>
                  <div className="flex flex-col gap-3">
                    <button 
                      onMouseDown={() => handleMobileInput('action', true)}
                      onMouseUp={() => handleMobileInput('action', false)}
                      onTouchStart={() => handleMobileInput('action', true)}
                      onTouchEnd={() => handleMobileInput('action', false)}
                      className="w-12 h-12 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center pointer-events-auto active:bg-emerald-500/20 transition-colors"
                    >
                      <div className="w-6 h-6 rounded-full border-2 border-white/30" />
                    </button>
                    <button 
                      className="w-12 h-12 rounded-full bg-emerald-500/80 backdrop-blur-md border border-white/10 flex items-center justify-center pointer-events-auto active:scale-95 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                    >
                      <Plus size={20} className="text-black" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
          </div>
        </section>

        {/* Right Sidebar: Inspector */}
        <AnimatePresence initial={false}>
          {rightSidebarOpen && (
            <motion.aside 
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              className={`border-l border-white/10 bg-[#252525] flex flex-col overflow-hidden z-40 ${isMobile ? 'absolute inset-y-0 right-0 w-80 shadow-2xl' : 'relative w-80'}`}
            >
              <div className="w-80 flex flex-col h-full">
          <div className="p-3 flex items-center justify-between border-b border-white/5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <Settings size={14} />
              <span>Inspector</span>
            </div>
            {isMobile && (
              <button 
                onClick={() => setRightSidebarOpen(false)}
                className="p-1 hover:bg-white/10 text-gray-400 rounded transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {selectedEntity ? (
              <div className="p-4 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-gray-500">Entity Name</label>
                  <input 
                    type="text" 
                    value={selectedEntity.name}
                    onChange={(e) => {
                      setProject(prev => ({
                        ...prev,
                        scenes: prev.scenes.map(s => s.id === prev.activeSceneId ? {
                          ...s,
                          entities: s.entities.map(ent => ent.id === selectedEntity.id ? { ...ent, name: e.target.value } : ent)
                        } : s)
                      }));
                    }}
                    className="w-full bg-[#1a1a1a] border border-white/5 rounded px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                </div>

                {selectedEntity.components.map(component => (
                  <ComponentAccordion key={component.id} entityId={selectedEntity.id} component={component} updateEntityComponent={updateEntityComponent} removeComponent={removeComponent} />
                ))}

                <div className="relative group">
                  <button className="w-full py-3 border-2 border-dashed border-white/5 rounded-lg text-xs font-bold uppercase text-gray-500 hover:border-emerald-500/30 hover:text-emerald-500 transition-all flex items-center justify-center gap-2">
                    <Plus size={14} />
                    Add Component
                  </button>
                  <div className="absolute top-full left-0 w-full mt-2 bg-[#2a2a2a] border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-1">
                    {[ComponentType.Physics, ComponentType.Collider, ComponentType.Script].map(type => (
                      <button 
                        key={type}
                        onClick={() => {
                          let newComp: any;
                          if (type === ComponentType.Physics) {
                            newComp = {
                              id: `p-${Date.now()}`,
                              type: ComponentType.Physics,
                              enabled: true,
                              mass: 1,
                              isStatic: false,
                              gravityScale: 1,
                              velocity: { x: 0, y: 0 }
                            };
                          } else if (type === ComponentType.Collider) {
                            newComp = {
                              id: `c-${Date.now()}`,
                              type: ComponentType.Collider,
                              enabled: true,
                              shape: 'box',
                              width: 100,
                              height: 100,
                              radius: 50,
                              offsetX: 0,
                              offsetY: 0,
                              isTrigger: false,
                              isPassThrough: false
                            };
                          } else {
                            newComp = {
                              id: `sc-${Date.now()}`,
                              type: ComponentType.Script,
                              enabled: true,
                              code: "// Write your script here"
                            };
                          }
                          
                          setProject(prev => ({
                            ...prev,
                            scenes: prev.scenes.map(s => s.id === prev.activeSceneId ? {
                              ...s,
                              entities: s.entities.map(e => e.id === selectedEntity.id ? {
                                ...e,
                                components: [...e.components, newComp]
                              } : e)
                            } : s)
                          }));
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-500/10 hover:text-emerald-500 rounded transition-colors"
                      >
                        {type} Component
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 opacity-30">
                <Box size={48} />
                <p className="text-sm">Select an entity to inspect its properties</p>
              </div>
            )}
          </div>
          </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Status Bar */}
      <footer className={`border-t border-white/10 bg-[#252525] flex items-center justify-between px-4 text-[10px] font-medium text-gray-500 transition-all ${isMobile ? 'h-5 px-2' : 'h-6'}`}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{isMobile ? 'Ready' : 'Engine Ready'}</span>
          </div>
          {!isMobile && <span>Project: {project.name}</span>}
        </div>
        <div className="flex items-center gap-4">
          <span>{isMobile ? 'Objs:' : 'Objects:'} {activeScene.entities.length}</span>
          {!isMobile && <span>Memory: 12.4 MB</span>}
        </div>
      </footer>
    </div>
  );
}
