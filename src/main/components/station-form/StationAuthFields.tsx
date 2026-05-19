import type { Dispatch, SetStateAction } from 'react'
import type { Station, StationFormTab, StationTypeDetectionState } from '../../types'
import { stationCredentialLabel } from '../../utils'

type StationAuthFieldsProps = {
  draft: Station
  editingId: string | null
  formTab: StationFormTab
  detectedType: StationTypeDetectionState
  isSub2ApiDraft: boolean
  isDeepSeekDraft: boolean
  setDraft: Dispatch<SetStateAction<Station>>
}

export function StationAuthFields({
  draft,
  editingId,
  formTab,
  detectedType,
  isSub2ApiDraft,
  isDeepSeekDraft,
  setDraft
}: StationAuthFieldsProps) {
  const shouldShow = editingId || formTab === 'provider' || detectedType === 'newapi' || detectedType === 'sub2api'
  if (!shouldShow) return null

  if (draft.authMode === 'login') {
    return (
      <>
        <label className="flex flex-col gap-1.5 text-[11px] font-bold text-gray-500">
          {isSub2ApiDraft ? '登录邮箱' : isDeepSeekDraft ? '手机号/邮箱' : '登录账号'}
          <input
            value={draft.loginUsername}
            onChange={event => setDraft(current => ({ ...current, loginUsername: event.target.value }))}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all duration-200"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[11px] font-bold text-gray-500">
          登录密码
          <input
            type="password"
            value={draft.loginPassword}
            onChange={event => setDraft(current => ({ ...current, loginPassword: event.target.value }))}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all duration-200"
          />
        </label>
        <div className="px-3 py-2.5 rounded-xl bg-primary-50 border border-primary-100 text-[11px] font-semibold text-primary-600">
          {isSub2ApiDraft
            ? '保存时会自动登录获取 Bearer Token，后续令牌失效时会自动重登。'
            : isDeepSeekDraft
              ? '保存时会自动登录获取 Token，用于查询余额，令牌失效会自动重登。'
              : '保存时会自动登录获取 `cookie` 和 `new_api_user`，后续 cookie 失效也会自动重登。'}
        </div>
      </>
    )
  }

  return (
    <>
      {!isSub2ApiDraft && !isDeepSeekDraft ? (
        <label className="flex flex-col gap-1.5 text-[11px] font-bold text-gray-500">
          {stationCredentialLabel(draft.stationType)}
          <input
            value={draft.newApiUser}
            onChange={event => setDraft(current => ({ ...current, newApiUser: event.target.value }))}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all duration-200"
          />
        </label>
      ) : null}
      <label className="flex flex-col gap-1.5 text-[11px] font-bold text-gray-500">
        {isSub2ApiDraft ? 'Bearer Token' : isDeepSeekDraft ? 'API Key / Token' : 'Cookie'}
        <textarea
          rows={4}
          value={draft.cookie}
          onChange={event => setDraft(current => ({ ...current, cookie: event.target.value }))}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all duration-200 resize-y"
        />
      </label>
    </>
  )
}
