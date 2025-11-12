'use client'

import { Pill } from '@payloadcms/ui'
import { DefaultCellComponentProps } from 'payload'

type PublishState = 'not_published' | 'scheduled' | 'published' | 'none'

export const PublishStatePill = ({ state }: { state: PublishState }) => {
  switch (state) {
    case 'not_published':
      return <Pill pillStyle="error">Not Published</Pill>
    case 'scheduled':
      return <Pill pillStyle="warning">Scheduled</Pill>
    case 'published':
      return <Pill pillStyle="success">Published</Pill>
    default:
      return <></>
  }
}

export const getPublishState = (publishAt?: string): PublishState => {
  if (!publishAt) {
    return 'not_published'
  }

  const publishDate = new Date(publishAt)
  const currentDate = new Date()
  currentDate.setUTCHours(0, 0, 0, 0)
  publishDate.setUTCHours(0, 0, 0, 0)

  if (publishDate > currentDate) {
    return 'scheduled'
  } else if (publishDate <= currentDate) {
    return 'published'
  } else {
    return 'none'
  }
}

export const PublishStateCell = ({ cellData }: DefaultCellComponentProps) => {
  return (
    <>
      <PublishStatePill state={getPublishState(cellData)} />
      <br />
      {cellData && new Date(cellData).toLocaleDateString('en-US', { dateStyle: 'long' })}
    </>
  )
}

export default PublishStateCell
