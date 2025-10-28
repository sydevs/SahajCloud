'use client'

import { useField } from '@payloadcms/ui'
import { PublishStatePill, getPublishState } from './PublishStateCell'

export const PublishAtAfterInput = () => {
  const { value, initialValue } = useField<string>({
    path: 'publishAt',
  })

  const currentState = getPublishState(initialValue)
  const newState = getPublishState(value)

  if (currentState == newState) {
    return (
      <div style={{ margin: '5px 0' }}>
        <PublishStatePill state={currentState} />
      </div>
    )
  } else {
    return (
      <>
        <div
          style={{
            gap: '5px',
            display: 'flex',
            alignItems: 'center',
            margin: '5px 0',
          }}
        >
          <PublishStatePill state={currentState} />
          {' -> '}
          <PublishStatePill state={newState} />
        </div>
        Status will change
      </>
    )
  }
}

export default PublishAtAfterInput
