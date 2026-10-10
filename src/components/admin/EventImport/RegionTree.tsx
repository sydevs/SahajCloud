'use client'

import type { StaticDescription, StaticLabel } from 'payload'

import { Banner, Button, SelectInput, TextInput, useField } from '@payloadcms/ui'
import { useMemo, useState, type ChangeEvent } from 'react'

import type { TreeEdit } from '@/collections/EventImports/propose/edit'
import type { ExistingRegion } from '@/collections/EventImports/propose/match'
import { tallyTree, type ProposedNode, type ProposedTree } from '@/collections/EventImports/propose/tree'

import { FieldShell, useBatchReadOnly } from './FieldShell'
import {
  childrenByParent,
  isEditableNode,
  isUnmappableNode,
  mappableByLevel,
  mergedNote,
  nodeCountNote,
  nodeMatchNote,
  takenSlugsFor,
  type MappableByLevel,
} from './treeModel'

export interface RegionTreeProps {
  /** The field's own label and description, so the wrapper renders neither. */
  readonly label: StaticLabel | undefined
  readonly description?: StaticDescription
  readonly path: string
  /** Regions in the target's subtree a node may be mapped onto, by level. */
  readonly mappable: readonly ExistingRegion[]
  /** The target's name, the last disambiguator a top-level slug has. */
  readonly targetName: string
}

/**
 * The region tree the batch would create, and the two edits a reviewer may make
 * to it.
 *
 * ⚠ **Every edit runs `applyTreeEdits` and stores the whole tree it returns.**
 * A rename reassigns slugs across siblings and a mapping can prune a state that
 * is now empty, so a patch of the one node would leave a tree the commit then
 * walks past. It is the same function the write side composes, which is what
 * makes the submitted value one `hooks/reviewerEdits.ts` accepts rather than a
 * guess at what it will accept.
 *
 * ⚠ **…and imports it on the click, never at the top.** `applyTreeEdits` reaches
 * `propose/slugs.ts`, the only importer of `any-ascii` — about 214 KiB gzipped
 * of transliteration tables, which would otherwise sit in this edit view's eager
 * chunk for the sake of a button pressed two or three times per batch.
 *
 * ⚠ **Picking a region and mapping onto it are two steps.** Arrow keys on a
 * focused select fire `change` in Chrome on Windows and Linux, so a control that
 * sent the edit itself mapped a city onto the first candidate as a reviewer
 * tabbed through the tree.
 */
export const RegionTree = ({ description, label, mappable, path, targetName }: RegionTreeProps) => {
  const { setValue, value } = useField<ProposedTree>({ path })
  const readOnly = useBatchReadOnly()
  const [refusal, setRefusal] = useState<null | string>(null)

  // Keyed on `value`, not on a `value?.nodes ?? []` binding — that is a new
  // array identity on every render, so the memo would never hold.
  const byParent = useMemo(() => childrenByParent(value?.nodes ?? []), [value])
  const byLevel = useMemo(() => mappableByLevel(mappable), [mappable])
  const nodes = value?.nodes ?? []

  const applyEdit = async (edit: TreeEdit) => {
    if (!value) return
    const { applyTreeEdits } = await import('@/collections/EventImports/propose/edit')
    const result = applyTreeEdits({
      tree: value,
      edits: [edit],
      mappable,
      targetName,
      takenSlugs: takenSlugsFor(mappable, nodes),
    })
    if (!result.ok) {
      setRefusal(result.error)
      return
    }
    setRefusal(null)
    setValue(result.tree)
  }

  const tally = value ? tallyTree(value) : null
  const stateLayer = value?.stateLayer

  return (
    <FieldShell description={description} label={label} path={path} readOnly={readOnly}>
      {refusal ? <Banner type="error">{refusal}</Banner> : null}
      {stateLayer && !stateLayer.proposed ? (
        <p className="event-import__note">{`No state layer: ${stateLayer.reason}`}</p>
      ) : null}
      {nodes.length === 0 ? (
        <p className="event-import__note">
          The proposal is not ready yet. It appears once the addresses have been looked up.
        </p>
      ) : (
        <>
          {/* `tallyTree` rather than a count of our own: a reviewer who maps a
              node watches `creating` fall by one, so the review and the commit
              report counting differently would read as an edit that did nothing. */}
          {tally ? (
            <p className="event-import__note">
              {`${tally.creating} to create, ${tally.existing} already in the Atlas.`}
            </p>
          ) : null}
          <TreeLevel
            byLevel={byLevel}
            nodes={byParent}
            onEdit={applyEdit}
            parentKey={null}
            readOnly={readOnly}
          />
        </>
      )}
      {tally?.rowErrors ? (
        <>
          <p className="event-import__note">
            {`${tally.rowErrors} ${tally.rowErrors === 1 ? 'line' : 'lines'} cannot be filed anywhere in this region:`}
          </p>
          <ul className="event-import__row-errors">
            {(value?.rowErrors ?? []).map(({ line, message }) => (
              <li key={line}>{`Line ${line} — ${message}`}</li>
            ))}
          </ul>
        </>
      ) : null}
    </FieldShell>
  )
}

interface TreeLevelProps {
  readonly nodes: Map<null | string, ProposedNode[]>
  readonly parentKey: null | string
  readonly byLevel: MappableByLevel
  readonly readOnly: boolean
  readonly onEdit: (edit: TreeEdit) => void
}

/** One level of the proposed tree, nested so the hierarchy reads without styling. */
const TreeLevel = ({ byLevel, nodes, onEdit, parentKey, readOnly }: TreeLevelProps) => {
  const level = nodes.get(parentKey) ?? []
  if (!level.length) return null

  return (
    <ul className="event-import__tree">
      {level.map((node) => (
        <li key={node.key}>
          <TreeNode byLevel={byLevel} node={node} onEdit={onEdit} readOnly={readOnly} />
          <TreeLevel
            byLevel={byLevel}
            nodes={nodes}
            onEdit={onEdit}
            parentKey={node.key}
            readOnly={readOnly}
          />
        </li>
      ))}
    </ul>
  )
}

interface TreeNodeProps {
  readonly node: ProposedNode
  readonly byLevel: MappableByLevel
  readonly readOnly: boolean
  readonly onEdit: (edit: TreeEdit) => void
}

/** One proposed region, with the edits it accepts where it accepts them. */
const TreeNode = ({ byLevel, node, onEdit, readOnly }: TreeNodeProps) => {
  const [draft, setDraft] = useState(node.name)
  const [target, setTarget] = useState('')
  const merged = mergedNote(node)
  const editable = isEditableNode(node) && !readOnly
  // Only the node's own level: a city mapped onto a state is a refusal the
  // reviewer was invited to make.
  const candidates = editable ? (byLevel.get(node.level) ?? []) : []

  return (
    <div className="event-import__node">
      <span>
        <strong>{node.name}</strong>
        {` — ${node.level}, ${nodeCountNote(node)}, ${nodeMatchNote(node)}`}
        {node.slug ? ` (${node.slug})` : ''}
      </span>
      {merged ? <span className="event-import__merged">{merged}</span> : null}

      {isUnmappableNode(node) && !readOnly ? (
        <Button
          buttonStyle="secondary"
          onClick={() => onEdit({ kind: 'unmap', key: node.key })}
          size="small"
        >
          Create it instead
        </Button>
      ) : null}

      {editable ? (
        <div className="event-import__node-edit">
          <TextInput
            label={`Rename ${node.name}`}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
            // A control inside one field's own value, so this names the input
            // rather than a path Payload keeps form state at.
            path={`rename-${node.key}`}
            value={draft}
          />
          <Button
            buttonStyle="secondary"
            disabled={!draft.trim() || draft.trim() === node.name}
            onClick={() => onEdit({ kind: 'rename', key: node.key, name: draft.trim() })}
            size="small"
          >
            Rename
          </Button>

          {candidates.length ? (
            <div className="event-import__map">
              <SelectInput
                label={`Or use a region already in the Atlas for ${node.name}`}
                name={`map-${node.key}`}
                onChange={(option) => {
                  const chosen = Array.isArray(option) ? option[0] : option
                  setTarget(chosen?.value ? String(chosen.value) : '')
                }}
                options={candidates.map((region) => ({
                  // `Regions.name` is optional and `slug` is required, so the
                  // slug is what names a region nobody titled.
                  label: region.name ?? region.slug ?? String(region.id),
                  value: String(region.id),
                }))}
                path={`map-${node.key}`}
                value={target}
              />
              <Button
                buttonStyle="secondary"
                disabled={!target}
                onClick={() => {
                  const regionId = Number(target)
                  if (regionId) onEdit({ kind: 'map', key: node.key, regionId })
                }}
                size="small"
              >
                Use it
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
