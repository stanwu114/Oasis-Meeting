import { app, dialog } from 'electron'
import * as docx from 'docx'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'

/**
 * 导出 Meeting 为 Word 文档(按照用户提供的模板结构):
 * 标题「会议纪要」+ 编号 + 表格(名称/时间/地点/主题/参会人/纪要)
 */

export interface ExportMeetingData {
  title: string
  meetingName: string
  time: string
  location: string
  topic: string
  participants: string
  summary: string
}

export async function exportMeetingToWord(data: ExportMeetingData): Promise<string | null> {
  const saveDialog = dialog.showSaveDialog

  // 纪要内容按行拆分
  const summaryLines = data.summary
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // 构建表格行
  const cell = (text: string, width: number, isLabel = false): docx.TableCell =>
    new docx.TableCell({
      width: { size: width, type: docx.WidthType.DXA },
      shading: isLabel ? { fill: 'F2F2F2', type: docx.ShadingType.CLEAR } : undefined,
      verticalAlign: docx.VerticalAlign.CENTER,
      margins: { top: 120, bottom: 120, left: 160, right: 160 },
      children: [
        new docx.Paragraph({
          children: [
            new docx.TextRun({
              text,
              bold: isLabel,
              size: isLabel ? 22 : 21,
              font: 'SimSun'
            })
          ]
        })
      ]
    })

  const labelWidth = 1800
  const valueWidth = 3900

  const table = new docx.Table({
    width: { size: 9600, type: docx.WidthType.DXA },
    columnWidths: [labelWidth, valueWidth, labelWidth, valueWidth],
    rows: [
      // 会议名称(占满)
      new docx.TableRow({
        children: [
          cell('会议名称', labelWidth, true),
          new docx.TableCell({
            columnSpan: 3,
            width: { size: valueWidth * 3, type: docx.WidthType.DXA },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            verticalAlign: docx.VerticalAlign.CENTER,
            children: [
              new docx.Paragraph({
                children: [new docx.TextRun({ text: data.meetingName, size: 21, font: 'SimSun' })]
              })
            ]
          })
        ]
      }),
      // 时间 | 地点
      new docx.TableRow({
        children: [
          cell('时间', labelWidth, true),
          cell(data.time, valueWidth),
          cell('地点', labelWidth, true),
          cell(data.location, valueWidth)
        ]
      }),
      // 会议主题(占满)
      new docx.TableRow({
        children: [
          cell('会议主题', labelWidth, true),
          new docx.TableCell({
            columnSpan: 3,
            width: { size: valueWidth * 3, type: docx.WidthType.DXA },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [
              new docx.Paragraph({
                children: [new docx.TextRun({ text: data.topic, size: 21, font: 'SimSun' })]
              })
            ]
          })
        ]
      }),
      // 参会人员(占满)
      new docx.TableRow({
        children: [
          cell('参会人员', labelWidth, true),
          new docx.TableCell({
            columnSpan: 3,
            width: { size: valueWidth * 3, type: docx.WidthType.DXA },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [
              new docx.Paragraph({
                children: [new docx.TextRun({ text: data.participants, size: 21, font: 'SimSun' })]
              })
            ]
          })
        ]
      }),
      // 会议纪要(AI 总结,占满,多行)
      new docx.TableRow({
        children: [
          cell('会议纪要', labelWidth, true),
          new docx.TableCell({
            columnSpan: 3,
            width: { size: valueWidth * 3, type: docx.WidthType.DXA },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: summaryLines.length > 0
              ? summaryLines.map((line) => {
                  const isHeading = line.startsWith('## ')
                  const text = isHeading ? line.slice(3) : line.replace(/^[-*]\s+/, '· ')
                  return new docx.Paragraph({
                    spacing: { after: 80 },
                    children: [
                      new docx.TextRun({
                        text,
                        bold: isHeading,
                        size: isHeading ? 22 : 21,
                        font: 'SimSun'
                      })
                    ]
                  })
                })
              : [
                  new docx.Paragraph({
                    children: [new docx.TextRun({ text: '(暂无纪要)', size: 21, font: 'SimSun' })]
                  })
                ]
          })
        ]
      })
    ]
  })

  const doc = new docx.Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
          }
        },
        children: [
          // 标题
          new docx.Paragraph({
            alignment: docx.AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new docx.TextRun({
                text: '会议纪要',
                bold: true,
                size: 36,
                font: 'SimHei'
              })
            ]
          }),
          // 编号
          new docx.Paragraph({
            alignment: docx.AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [
              new docx.TextRun({
                text: `纪要编号 ${Date.now().toString().slice(-6)}`,
                size: 21,
                color: '666666',
                font: 'SimSun'
              })
            ]
          }),
          table
        ]
      }
    ]
  })

  const buffer = await docx.Packer.toBuffer(doc)

  // 保存对话框
  const defaultName = `${data.title || '未命名会议'}.docx`
  const { canceled, filePath } = await saveDialog({
    defaultPath: join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'Word 文档', extensions: ['docx'] }]
  })

  if (canceled || !filePath) return null

  await writeFile(filePath, buffer)
  return filePath
}
