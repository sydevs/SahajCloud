'use client'

import type { ClientFieldWithOptionalType, StaticLabel } from 'payload'

import { Banner, Button, FieldLabel, TextInput, useField, useFormFields } from '@payloadcms/ui'
import { useState, type ChangeEvent } from 'react'

import { applyTreeEdits, type TreeEdit } from '@/collections/EventImports/propose/edit'
import type { ExistingRegion } from '@/collections/EventImports/propose/match'
import type { ProposedNode, ProposedTree } from '@/collections/EventImports/propose/tree'

import {
  childrenByParent,
  isEditableNode,
  isUnmappableNode,
  mappableFor,
  mergedNote,
  nodeCountNote,
  nodeMatchNote,
  takenSlugsFor,
} from './treeModel'

import './styles.css'

export interface RegionTreeProps {
  /** The field's own label, so the wrapper needs no `FieldLabel` of its own. */
  readonly label: StaticLabel | undefined
  readonly path: string
  /** Regions in the target's subtree a node may be mapped onto. */
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
 * ⚠ **Picking a region and mapping onto it are two steps.** Arrow keys on a
 * focused `<select>` fire `change` in Chrome on Windows and Linux, so a select
 * that sent the edit itself mapped a city onto the first candidate as a reviewer
 * tabbed through the tree.
 *
 * ⚠ **Editable only while the batch reads `review`.** The stage comes from form
 * state, so the controls go read-only the moment `ImportProgress`'s refresh
 * brings a running or finished status in.
 */
export const RegionTree = ({ label, mappable, path, targetName }: RegionTreeProps) => {
  const { setValue, value } = useField<ProposedTree>({ path })
  const status = useFormFields(([fields]) => fields.status?.value)
  const [refusal, setRefusal] = useState<null | string>(null)

  const readOnly = status !== 'review'
  const nodes = value?.nodes ?? []

  const applyEdit = (edit: TreeEdit) => {
    if (!value) return
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

  const rowErrors = value?.rowErrors ?? []
  const stateLayer = value?.stateLayer

  return (
    <div className={`field-type json${readOnly ? ' read-only' : ''}`}>
      <FieldLabel label={label} path={path} />
      <div className="field-type__wrap event-import__tree-wrap">
        {refusal ? <Banner type="error">{refusal}</Banner> : null}
        {stateLayer && !stateLayer.proposed ? (
          <p className="event-import__note">{`No state layer: ${stateLayer.reason}`}</p>
        ) : null}
        {nodes.length === 0 ? (
          <p className="event-import__note">
            The proposal is not ready yet. It appears once the addresses have been looked up.
          </p>
        ) : (
          <TreeLevel
            mappable={mappable}
            nodes={childrenByParent(nodes)}
            onEdit={applyEdit}
            parentKey={null}
            readOnly={readOnly}
          />
        )}
        {rowErrors.length ? (
          <>
            <p className="event-import__note">
              {`${rowErrors.length} ${rowErrors.length === 1 ? 'line' : 'lines'} cannot be filed anywhere in this region:`}
            </p>
            <ul className="event-import__row-errors">
              {rowErrors.map(({ line, message }) => (
                <li key={line}>{`Line ${line} — ${message}`}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  )
}

interface TreeLevelProps {
  readonly nodes: Map<null | string, ProposedNode[]>
  readonly parentKey: null | string
  readonly mappable: readonly ExistingRegion[]
  readonly readOnly: boolean
  readonly onEdit: (edit: TreeEdit) => void
}

/** One level of the proposed tree, nested so the hierarchy reads without styling. */
const TreeLevel = ({ mappable, nodes, onEdit, parentKey, readOnly }: TreeLevelProps) => {
  const level = nodes.get(parentKey) ?? []
  if (!level.length) return null

  return (
    <ul className="event-import__tree">
      {level.map((node) => (
        <li key={node.key}>
          <TreeNode mappable={mappable} node={node} onEdit={onEdit} readOnly={readOnly} />
          <TreeLevel
            mappable={mappable}
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
  readonly mappable: readonly ExistingRegion[]
  readonly readOnly: boolean
  readonly onEdit: (edit: TreeEdit) => void
}

/** One proposed region, with the edits it accepts where it accepts them. */
const TreeNode = ({ mappable, node, onEdit, readOnly }: TreeNodeProps) => {
  const [draft, setDraft] = useState(node.name)
  const [target, setTarget] = useState('')
  const candidates = mappableFor(mappable, node)
  const merged = mergedNote(node)

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

      {isEditableNode(node) && !readOnly ? (
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
            <label className="event-import__map">
              {`Or use a region already in the Atlas for ${node.name}`}
              <select onChange={(event) => setTarget(event.target.value)} value={target}>
                <option value="">Choose a region…</option>
                {candidates.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name ?? region.slug}
                  </option>
                ))}
              </select>
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
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** What the server wrapper reads off the field it renders this for. */
export type RegionTreeClientField = ClientFieldWithOptionalType & { label?: StaticLabel }
