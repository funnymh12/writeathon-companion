import React, { useState, useRef, useEffect } from 'react';
import { Space } from '../utils/api';
import { ChevronDown, Check, Folder } from 'lucide-react';

interface SpaceSelectorProps {
    spaces: Space[];
    selectedSpaceId: string;
    onChange: (spaceId: string) => void;
    className?: string;
}

const SpaceSelector: React.FC<SpaceSelectorProps> = ({ spaces, selectedSpaceId, onChange, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedSpace = spaces.find(s => (s._id || s.id) === selectedSpaceId);
    const displayTitle = selectedSpace?.title || '选择空间';

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-200 outline-none
                    ${isOpen
                        ? 'bg-primary/10 border-primary/20 text-primary shadow-[0_0_0_2px_rgba(20,184,166,0.1)]'
                        : 'bg-card/50 border-transparent hover:bg-muted/50 text-foreground/80 hover:text-foreground'
                    }
                `}
            >
                <Folder className={`h-3.5 w-3.5 ${isOpen ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="text-[11px] font-bold max-w-[100px] truncate">{displayTitle}</span>
                <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : 'text-muted-foreground/70'}`} />
            </button>

            {/* Dropdown Menu */}
            <div className={`
                absolute top-full left-0 mt-2 w-48 max-h-64 overflow-y-auto 
                bg-popover border border-border/50 rounded-xl shadow-xl shadow-black/5 z-50
                origin-top-left transition-all duration-200 ease-out scrollbar-thin
                ${isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'}
            `}>
                <div className="p-1 space-y-0.5">
                    {spaces.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground text-center">暂无空间</div>
                    ) : (
                        spaces.map((space) => {
                            const isSelected = (space._id || space.id) === selectedSpaceId;
                            return (
                                <button
                                    key={space._id || space.id}
                                    onClick={() => {
                                        onChange(space._id || space.id);
                                        setIsOpen(false);
                                    }}
                                    className={`
                                        w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors
                                        ${isSelected
                                            ? 'bg-primary/10 text-primary font-bold'
                                            : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                                        }
                                    `}
                                >
                                    <span className="truncate">{space.title}</span>
                                    {isSelected && <Check className="h-3 w-3" />}
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default SpaceSelector;
