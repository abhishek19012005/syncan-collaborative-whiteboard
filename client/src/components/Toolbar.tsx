import type { Tool } from '../types/drawing'

type Props = { tool: Tool; color: string; width: number; canUndo: boolean; canRedo: boolean; setTool: (tool: Tool) => void; setColor: (color: string) => void; setWidth: (width: number) => void; undo: () => void; redo: () => void; clear: () => void; exportPng: () => void; exportPdf: () => void }
export function Toolbar(props: Props) {
  return <div className="toolbar glass">
    <div className="tool-group"><button className={props.tool === 'pen' ? 'tool-btn active' : 'tool-btn'} onClick={() => props.setTool('pen')} title="Pen">✎ <span>Pen</span></button><button className={props.tool === 'eraser' ? 'tool-btn active' : 'tool-btn'} onClick={() => props.setTool('eraser')} title="Eraser">⌫ <span>Eraser</span></button></div>
    <div className="toolbar-divider"/>
    <label className="color-control"><span>Color</span><input type="color" value={props.color} onChange={e => props.setColor(e.target.value)} /><b style={{ background: props.color }}/></label>
    <label className="size-control"><span>Size</span><input type="range" min="1" max="40" value={props.width} onChange={e => props.setWidth(Number(e.target.value))}/><em>{props.width}px</em></label>
    <div className="toolbar-spacer"/>
    <button className="icon-btn" disabled={!props.canUndo} onClick={props.undo} title="Undo your latest stroke">↶ <span>Undo</span></button><button className="icon-btn" disabled={!props.canRedo} onClick={props.redo} title="Redo your latest undone stroke">↷ <span>Redo</span></button><button className="export-btn" onClick={props.exportPng} title="Export PNG">PNG</button><button className="export-btn" onClick={props.exportPdf} title="Save as PDF">PDF</button><button className="clear-btn" onClick={props.clear}>⌫ Clear</button>
  </div>
}
