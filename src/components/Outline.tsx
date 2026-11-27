import { useState } from 'react'
import { IconChevron } from './Icons'

export interface OutlineItem {
  title: string
  dest: string | unknown[] | null
  url: string | null
  items: OutlineItem[]
  bold?: boolean
  italic?: boolean
}

interface Props {
  items: OutlineItem[]
  onNavigate: (item: OutlineItem) => void
}

export function Outline({ items, onNavigate }: Props) {
  if (!items.length) {
    return <p className="empty">Este documento no tiene índice.</p>
  }
  return (
    <ul className="outline" role="tree">
      {items.map((item, i) => (
        <OutlineNode key={i} item={item} onNavigate={onNavigate} depth={0} />
      ))}
    </ul>
  )
}

function OutlineNode({ item, onNavigate, depth }: { item: OutlineItem; onNavigate: Props['onNavigate']; depth: number }) {
  const [open, setOpen] = useState(depth === 0 && item.items.length <= 12)
  const hasChildren = item.items.length > 0
  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined}>
      <div className="outline-row">
        {hasChildren ? (
          <button className={`toggle ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}
            aria-label={open ? 'Contraer' : 'Expandir'}>
            <IconChevron width={14} height={14} />
          </button>
        ) : (
          <span className="toggle-spacer" />
        )}
        <button
          className="outline-link"
          style={{ fontWeight: item.bold ? 700 : undefined, fontStyle: item.italic ? 'italic' : undefined }}
          onClick={() => onNavigate(item)}
          title={item.title}
        >
          {item.title}
        </button>
      </div>
      {hasChildren && open && (
        <ul role="group">
          {item.items.map((child, i) => (
            <OutlineNode key={i} item={child} onNavigate={onNavigate} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
