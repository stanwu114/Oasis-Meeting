import { useEffect, useRef, useState } from 'react'
import { createReactBlockSpec } from '@blocknote/react'

/**
 * 会议信息卡:会议名称(AI 依据录音自动填)/ 地点(自动定位)/ 主题 / 时间(创建时北京时间)/ 参会人员。
 * 五个字段就地编辑,防抖写回块属性(随页面文档持久化)。
 */

interface MetaProps {
  name: string
  location: string
  topic: string
  time: string
  participants: string
}

const FIELDS: { key: keyof MetaProps; label: string; placeholder: string }[] = [
  { key: 'name', label: '会议名称', placeholder: '录音转写后自动填写' },
  { key: 'location', label: '会议地点', placeholder: '自动定位中…' },
  { key: 'topic', label: '会议主题', placeholder: '填写本次会议主题' },
  { key: 'time', label: '会议时间', placeholder: '' },
  { key: 'participants', label: '参会人员', placeholder: '填写参会人员,顿号分隔' }
]

function MeetingMetaView({ block, editor }: { block: { id: string; props: Record<string, string> }; editor: { updateBlock: (b: unknown, u: unknown) => unknown } }): React.ReactNode {
  const [values, setValues] = useState<MetaProps>({
    name: block.props.name ?? '',
    location: block.props.location ?? '',
    topic: block.props.topic ?? '',
    time: block.props.time ?? '',
    participants: block.props.participants ?? ''
  })
  const timer = useRef<number | null>(null)
  const latest = useRef(values)
  latest.current = values

  /* 外部变更(AI 命名/自动定位)同步进输入框 */
  useEffect(() => {
    setValues((v) => ({
      name: block.props.name || v.name,
      location: block.props.location || v.location,
      topic: block.props.topic || v.topic,
      time: block.props.time || v.time,
      participants: block.props.participants || v.participants
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.props.name, block.props.location, block.props.topic, block.props.time, block.props.participants])

  const onChange = (key: keyof MetaProps, value: string): void => {
    setValues((v) => ({ ...v, [key]: value }))
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      try {
        editor.updateBlock(block.id, { props: latest.current } as never)
      } catch {
        /* noop */
      }
    }, 400)
  }

  return (
    <div className="meeting-meta">
      {FIELDS.map((f) => (
        <div key={f.key} className="meeting-meta-row">
          <span className="meeting-meta-label">{f.label}</span>
          <input
            className="meeting-meta-input"
            value={f.key === 'time' ? values.time || '—' : values[f.key]}
            placeholder={f.placeholder}
            readOnly={f.key === 'time'}
            onChange={(e) => onChange(f.key, e.target.value)}
          />
        </div>
      ))}
    </div>
  )
}

export const MeetingMetaBlock = createReactBlockSpec(
  {
    type: 'meetingMeta',
    propSchema: {
      name: { default: '' },
      location: { default: '' },
      topic: { default: '' },
      time: { default: '' },
      participants: { default: '' }
    },
    content: 'none'
  },
  {
    render: (props) => <MeetingMetaView block={props.block as never} editor={props.editor as never} />
  }
)
