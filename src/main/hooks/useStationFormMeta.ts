import { useMemo } from 'react'
import type { Station } from '../types'
import { isDeepSeekStation } from '../utils'

type UseStationFormMetaOptions = {
  draft: Station
  formSaving: boolean
}

export function useStationFormMeta({ draft, formSaving }: UseStationFormMetaOptions) {
  return useMemo(() => {
    const isSub2ApiDraft = draft.stationType === 'sub2api'
    const isDeepSeekDraft = draft.stationType === 'deepseek'

    const submitDisabled = (
      formSaving ||
      !draft.stationType ||
      (draft.stationType !== 'deepseek' && !draft.baseUrl) ||
      (isDeepSeekStation(draft.stationType)
        ? (draft.authMode === 'login'
          ? !draft.loginUsername || !draft.loginPassword
          : !draft.cookie.trim())
        : (draft.authMode === 'login'
          ? !draft.loginUsername || !draft.loginPassword
          : !draft.cookie || (!isSub2ApiDraft && !draft.newApiUser)))
    )

    const submitLabel = formSaving
      ? '登录并保存中...'
      : draft.authMode === 'login'
        ? '登录并开始监控'
        : '保存并开始监控'

    return {
      isSub2ApiDraft,
      isDeepSeekDraft,
      submitDisabled,
      submitLabel
    }
  }, [draft, formSaving])
}
