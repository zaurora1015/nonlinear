import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow,
  ReactFlowProvider, addEdge, useEdgesState, useNodesState,
} from '@xyflow/react';
import { Box, CheckSquare, FileText, GitBranch, HelpCircle, Lightbulb, Plus, Save, Target } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import './styles.css';

const KIND = {
  topic: { label: '主题', shape: 'topic', tone: 'cyan', icon: Target },
  idea: { label: '想法', shape: 'rounded', tone: 'blue', icon: Lightbulb },
  question: { label: '问题', shape: 'hexagon', tone: 'amber', icon: HelpCircle },
  claim: { label: '主张', shape: 'rect', tone: 'violet', icon: GitBranch },
  evidence: { label: '证据', shape: 'document', tone: 'rose', icon: FileText },
  decision: { label: '决策', shape: 'diamond', tone: 'emerald', icon: CheckSquare },
  task: { label: '任务', shape: 'task', tone: 'emerald', icon: CheckSquare },
};
const SHAPES = ['rounded', 'rect', 'hexagon', 'document', 'diamond', 'task', 'topic'];
const TONES = ['cyan', 'blue', 'violet', 'amber', 'rose', 'emerald'];

function DiagramNode({ data, selected }) {
  const meta = KIND[data.kind] || KIND.idea;
  const Icon = meta.icon;
  const shape = data.appearance?.shape || meta.shape;
  const tone = data.appearance?.tone || meta.tone;
  return <div className={`diagram-node shape-${shape} tone-${tone} ${selected ? 'is-selected' : ''}`}>
    <Handle type="target" position={Position.Left} />
    <div className="node-kicker"><Icon size={13} />{meta.label}</div>
    <div className="node-title">{data.title}</div>
    {data.body && <div className="node-body">{data.body}</div>}
    <Handle type="source" position={Position.Right} />
  </div>;
}
const nodeTypes = { diagram: DiagramNode };

function toFlow(doc) {
  return {
    nodes: doc.nodes.map((n) => ({ id: n.id, type: 'diagram', position: n.position, data: n })),
    edges: doc.edges.map((e) => ({
      id: e.id, source: e.from, target: e.to, label: e.label, type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed }, data: e,
    })),
  };
}
function uniqueId(prefix) { return `${prefix}_${Date.now().toString(36)}`; }

function Workspace() {
  const [doc, setDoc] = useState(null);
  const docRef = useRef(null);
  const queue = useRef(Promise.resolve());
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [sync, setSync] = useState('正在连接本地文件…');

  const applyDocument = useCallback((next) => {
    docRef.current = next; setDoc(next);
    const flow = toFlow(next); setNodes(flow.nodes); setEdges(flow.edges);
  }, [setEdges, setNodes]);

  const load = useCallback(async (external = false) => {
    const response = await fetch('/api/document');
    const next = await response.json();
    if (!docRef.current || next.document.revision > docRef.current.document.revision) {
      applyDocument(next); setSync(external ? `已载入 Codex 修改 · r${next.document.revision}` : `本地文件已连接 · r${next.document.revision}`);
    }
  }, [applyDocument]);

  useEffect(() => { load(); const events = new EventSource('/api/events'); events.onmessage = () => load(true); return () => events.close(); }, [load]);

  const commit = useCallback((transform, message = '已保存') => {
    const base = docRef.current;
    if (!base) return;
    const next = structuredClone(transform(structuredClone(base)));
    next.document.revision = base.document.revision + 1;
    applyDocument(next); setSync('正在保存…');
    queue.current = queue.current.then(async () => {
      const response = await fetch('/api/document', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: base.document.revision, document: next }) });
      const result = await response.json();
      if (!response.ok) { setSync('文件冲突，已重新载入'); await load(true); return; }
      if (docRef.current.document.revision === result.document.revision) applyDocument(result);
      setSync(`${message} · r${result.document.revision}`);
    }).catch(() => setSync('保存失败'));
  }, [applyDocument, load]);

  const addNodeAt = useCallback((position = { x: 360, y: 240 }, kind = 'idea') => {
    const id = uniqueId(kind);
    commit((draft) => { draft.nodes.push({ id, kind, title: '新想法', body: '', position, appearance: { shape: KIND[kind].shape, tone: KIND[kind].tone } }); return draft; }, '已新建节点');
    setSelectedId(id);
  }, [commit]);

  const onConnect = useCallback((params) => commit((draft) => {
    draft.edges.push({ id: uniqueId('edge'), from: params.source, to: params.target, relation: 'related_to', label: '关联' }); return draft;
  }, '已建立关系'), [commit]);

  const onNodeDragStop = useCallback((_event, node) => commit((draft) => {
    const target = draft.nodes.find((n) => n.id === node.id); if (target) target.position = node.position; return draft;
  }, '位置已保存'), [commit]);

  const saveSelection = useCallback(async (id) => {
    setSelectedId(id || null);
    await fetch('/api/view', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selected_node_ids: id ? [id] : [], updated_at: new Date().toISOString() }) });
  }, []);

  const selected = doc?.nodes.find((n) => n.id === selectedId);
  const updateSelected = (changes) => commit((draft) => {
    const target = draft.nodes.find((n) => n.id === selectedId); if (target) Object.assign(target, changes); return draft;
  }, '节点已更新');

  if (!doc) return <div className="loading">正在打开本地脑暴文件…</div>;
  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Box size={17} /></span><span>IDEA / GRAPH</span><small>LOCAL WORKSPACE</small></div>
      <div className="document-title"><span>{doc.document.title}</span><em>{doc.nodes.length} nodes · {doc.edges.length} links</em></div>
      <div className="sync"><i />{sync}</div>
    </header>
    <aside className="sidebar left-panel">
      <div className="panel-heading"><span>结构</span><button aria-label="新建节点" onClick={() => addNodeAt()}><Plus size={15} /></button></div>
      <div className="outline">
        {doc.nodes.map((node) => { const Icon = (KIND[node.kind] || KIND.idea).icon; return <button key={node.id} className={node.id === selectedId ? 'active' : ''} onClick={() => saveSelection(node.id)}><Icon size={14} /><span>{node.title}</span><small>{KIND[node.kind]?.label}</small></button>; })}
      </div>
      <div className="codex-hint"><span>CODEX READY</span><p>当前选择会写入 <code>workspace.brainstorm.view.json</code></p></div>
    </aside>
    <section className="canvas" onDoubleClick={(e) => { if (e.target.closest('.react-flow__node')) return; addNodeAt({ x: e.clientX - 260, y: e.clientY - 100 }); }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeDragStop={onNodeDragStop} onNodeClick={(_e, n) => saveSelection(n.id)} onPaneClick={() => saveSelection(null)} fitView minZoom={0.25} maxZoom={2}>
        <Background color="#253448" gap={24} size={1} />
        <MiniMap nodeColor={(n) => `var(--${n.data.appearance?.tone || 'cyan'})`} maskColor="rgba(5,10,16,.72)" />
        <Controls />
      </ReactFlow>
      <div className="canvas-note">双击空白处新建 · 从节点两侧端口建立关系</div>
    </section>
    <aside className="sidebar inspector">
      <div className="panel-heading"><span>属性</span><Save size={14} /></div>
      {!selected ? <div className="empty-inspector"><GitBranch size={28} /><p>选择一个节点编辑内容、类型与形状。</p></div> : <div className="form">
        <label>标题<input key={`${selected.id}-title`} defaultValue={selected.title} onBlur={(e) => updateSelected({ title: e.target.value || '未命名节点' })} /></label>
        <label>描述<textarea key={`${selected.id}-body`} defaultValue={selected.body} onBlur={(e) => updateSelected({ body: e.target.value })} /></label>
        <label>内容类型<select value={selected.kind} onChange={(e) => { const k = e.target.value; updateSelected({ kind: k, appearance: { shape: KIND[k].shape, tone: KIND[k].tone } }); }}>{Object.entries(KIND).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        <label>框的形状<div className="shape-grid">{SHAPES.map((shape) => <button key={shape} className={selected.appearance?.shape === shape ? 'active' : ''} onClick={() => updateSelected({ appearance: { ...selected.appearance, shape } })}>{shape}</button>)}</div></label>
        <label>标识颜色<div className="tone-grid">{TONES.map((tone) => <button key={tone} aria-label={tone} className={`tone-swatch tone-${tone} ${selected.appearance?.tone === tone ? 'active' : ''}`} onClick={() => updateSelected({ appearance: { ...selected.appearance, tone } })} />)}</div></label>
        <div className="node-id">ID · {selected.id}</div>
      </div>}
    </aside>
  </main>;
}

createRoot(document.getElementById('root')).render(<ReactFlowProvider><Workspace /></ReactFlowProvider>);
