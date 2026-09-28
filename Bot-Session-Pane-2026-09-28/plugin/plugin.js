import { host, useQuery, useValue } from '@hermes/plugin-sdk'
import { useEffect, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'bot-session-pane-stable'
const EXCLUDED_AUTOMATION_SOURCES = ['cron']
const EMPTY_ATOM = { get: () => null, listen: () => () => {}, subscribe: () => () => {} }

function selectedBotAtBoot() {
  try {
    return String(window?.__hermesSelectedBot?.profile || '').trim()
  } catch {
    return ''
  }
}

function normalized(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pl-PL')
    .replace(/\s+/g, ' ')
    .trim()
}

function terms(query) {
  return [...new Set(normalized(query).match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) || [])]
}

function count(text, needle) {
  if (!needle) return 0
  let at = 0
  let hits = 0
  while (at >= 0) {
    at = text.indexOf(needle, at)
    if (at < 0) break
    hits += 1
    at += needle.length || 1
  }
  return hits
}

function contentText(value) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text
    if (typeof value.content === 'string') return value.content
    if (Array.isArray(value.content)) return contentText(value.content)
  }
  return ''
}

function fullTranscript(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map(message => contentText(message?.content ?? message?.text ?? message))
    .filter(Boolean)
    .join('\n')
}

function sessionLabel(row, profile) {
  const title = String(row?.title || '').trim()
  if (title) return title
  const preview = String(row?.preview || row?.first_user_message || '')
    .replace(/^You:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return preview.slice(0, 90) || `Sesja ${profile}`
}

function sessionTime(row) {
  const stamp = typeof row?.last_active === 'number'
    ? row.last_active
    : typeof row?.started_at === 'number'
      ? row.started_at
      : null
  if (stamp === null) return ''
  try {
    return new Date(stamp * 1000).toLocaleString('pl-PL', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return ''
  }
}

function scoreMatch(row, transcript, query) {
  const phrase = normalized(query)
  const haystack = normalized(transcript)
  const words = terms(query)
  if (!phrase || !haystack || !words.length) return null

  const phraseHits = count(haystack, phrase)
  const corpus = haystack.match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) || []
  let coverage = 0
  let exactHits = 0
  let stemHits = 0

  for (const word of words) {
    const exact = corpus.filter(candidate => candidate === word).length
    const stem = word.length >= 4
      ? corpus.filter(candidate => candidate.startsWith(word.slice(0, Math.max(3, word.length - 2)))).length
      : 0
    if (exact || stem) coverage += 1
    exactHits += exact
    stemHits += stem
  }
  if (!phraseHits && !coverage) return null

  const title = normalized(sessionLabel(row, ''))
  const titleHits = phraseHits && title.includes(phrase) ? 1 : words.filter(word => title.includes(word)).length
  const recency = Number(row?.last_active || row?.started_at || 0)
  const recencyBonus = recency > 0 ? Math.min(5, Math.max(0, (recency - 1_700_000_000) / 20_000_000)) : 0
  const fraction = coverage / words.length
  const score = phraseHits * 44 + fraction * 35 + Math.min(exactHits, 20) * 4 + Math.min(stemHits, 20) * 1.5 + titleHits * 10 + recencyBonus
  const confidence = Math.min(99, Math.round(18 + fraction * 45 + Math.min(phraseHits, 2) * 20 + Math.min(exactHits, 8) * 2))
  return { score, confidence }
}

function snippet(transcript, query) {
  const text = String(transcript || '').replace(/\s+/g, ' ').trim()
  const needle = String(query || '').toLocaleLowerCase('pl-PL').trim()
  let index = needle ? text.toLocaleLowerCase('pl-PL').indexOf(needle) : -1
  if (index < 0) {
    const word = terms(query)[0]
    index = word ? normalized(text).indexOf(word) : -1
  }
  if (index < 0) return text.slice(0, 180)
  const start = Math.max(0, index - 72)
  const end = Math.min(text.length, index + Math.max(needle.length, 12) + 108)
  return `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

async function routeFor(profile) {
  if (typeof host.profileRoutes !== 'function') return null
  try {
    const routes = await host.profileRoutes()
    return (routes || []).find(route =>
      String(route?.profile || '') === profile || String(route?.targetProfile || '') === profile
    ) || null
  } catch {
    return null
  }
}

async function requestForProfile(profile, method, params = {}, options = {}) {
  const route = await routeFor(profile)
  const scoped = { ...params, profile: route?.targetProfile || profile }
  if (route && typeof host.requestProfile === 'function') {
    if (options.priority) return host.requestProfile(route, method, scoped, options.timeoutMs, { spawnPriority: options.priority })
    if (options.timeoutMs) return host.requestProfile(route, method, scoped, options.timeoutMs)
    return host.requestProfile(route, method, scoped)
  }
  return host.request(method, scoped)
}

function isManualSession(row) {
  const source = String(row?.source || '').trim().toLowerCase()
  return !EXCLUDED_AUTOMATION_SOURCES.includes(source)
}

function manualSessionRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter(item => isManualSession(item?.row || item))
}

async function listSessions(profile) {
  const response = await requestForProfile(profile, 'session.list', {
    // Hidden sessions include Bot Mode's internal canonical "Bot Chat".
    // The pane intentionally presents only conversations a person can manage.
    include_hidden: false,
    limit: 200
  })
  return { ...response, sessions: manualSessionRows(response?.sessions) }
}

async function searchHistory(profile, query) {
  const response = await requestForProfile(profile, 'session.search', {
    query,
    limit: 100
  }, { timeoutMs: 60_000 })
  return manualSessionRows(response?.results)
}

function sortSessions(rows) {
  return (Array.isArray(rows) ? rows : []).slice().sort((a, b) => {
    const at = Number(a?.last_active || a?.started_at || 0)
    const bt = Number(b?.last_active || b?.started_at || 0)
    return bt - at || String(a?.id || '').localeCompare(String(b?.id || ''))
  })
}

function BotSessionPane() {
  const focusedProfile = useValue(host.state.focusedSessionProfile || host.state.profile || EMPTY_ATOM)
  const [selectedBot, setSelectedBot] = useState(selectedBotAtBoot)

  useEffect(() => {
    const apply = detail => {
      const next = String(detail?.profile || '').trim()
      if (next) setSelectedBot(next)
    }
    const onBotSelection = event => apply(event?.detail)
    window.addEventListener('hermes:bots-selected', onBotSelection)
    apply(window.__hermesSelectedBot)
    return () => window.removeEventListener('hermes:bots-selected', onBotSelection)
  }, [])

  // Roster selection wins over the opened tab: switching Bot cards must refresh
  // this pane even before the user opens that Bot's canonical chat.
  const profile = String(selectedBot || focusedProfile || '').trim()
  const ownerKey = `local::${profile}`
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [openingSession, setOpeningSession] = useState('')
  const searchQuery = query.trim()

  const sessions = useQuery({
    queryKey: [ID, 'sessions', ownerKey],
    enabled: Boolean(profile),
    queryFn: async () => sortSessions((await listSessions(profile))?.sessions),
    refetchInterval: 5000,
    staleTime: 2000,
    retry: false,
    refetchOnWindowFocus: true
  })

  const matches = useQuery({
    queryKey: [ID, 'history-search', ownerKey, searchQuery],
    enabled: Boolean(profile && searchQuery),
    queryFn: () => searchHistory(profile, searchQuery),
    staleTime: 15_000,
    retry: false
  })

  const open = async row => {
    const storedId = String(row?.resolved_id || row?.id || '').trim()
    if (!storedId || openingSession) return

    setOpeningSession(storedId)
    try {
      const title = sessionLabel(row, profile)
      const bridge = window.__hermesOpenBotStoredSession

      if (typeof bridge === 'function') {
        // Let Bot Mode cancel any still-pending canonical-chat selection before
        // opening this side conversation. Calling host.openSession here directly
        // races the roster click and produces "superseded by a newer selection".
        const opened = await bridge({
          profile,
          id: storedId,
          title,
          messageCount: Number(row?.message_count || 0)
        })
        if (!opened) return
      } else {
        // Fallback for a Desktop window where Bot Mode has not loaded yet.
        const route = await routeFor(profile)
        await host.openSession(storedId, {
          profile,
          ...(route ? { route } : {}),
          intent: 'tab',
          awaitHydration: true,
          expectHistory: true,
          forceResume: true,
          keepAllProfilesScope: true,
          workspaceMode: 'bots',
          workspaceOwnerKey: `bot:${ownerKey}`,
          retryHydrationTimeoutOnce: true,
          tabTitle: title
        })
      }
    } catch (error) {
      host.notifyError?.(error, 'Nie można otworzyć sesji')
    } finally {
      setOpeningSession('')
    }
  }

  const createSession = async () => {
    if (!profile || creating || typeof host.openSession !== 'function') return
    setCreating(true)
    try {
      const created = await requestForProfile(profile, 'session.create', {
        source: 'desktop',
        title: 'Nowa sesja',
        hidden: false,
        follow_profile_config: true
      }, { priority: 'foreground', timeoutMs: 45_000 })
      const storedId = created?.stored_session_id || created?.session_id
      if (!storedId) throw new Error('Brak identyfikatora nowej sesji')
      const title = 'Nowa sesja'
      const bridge = window.__hermesOpenBotStoredSession
      if (typeof bridge === 'function') {
        const opened = await bridge({ profile, id: storedId, title, messageCount: 0 })
        if (!opened) return
      } else {
        const route = await routeFor(profile)
        await host.openSession(storedId, {
          profile,
          ...(route ? { route } : {}),
          intent: 'tab',
          awaitHydration: true,
          expectHistory: false,
          forceResume: true,
          keepAllProfilesScope: true,
          workspaceMode: 'bots',
          workspaceOwnerKey: `bot:${ownerKey}`,
          retryHydrationTimeoutOnce: true,
          tabTitle: title
        })
      }
      sessions.refetch()
    } catch (error) {
      host.notifyError?.(error, 'Nie można utworzyć sesji dla tego Bota')
    } finally {
      setCreating(false)
    }
  }

  if (!profile) {
    return jsxs('div', {
      className: 'flex h-full flex-col gap-2 p-3 text-sm',
      children: [
        jsx('div', { className: 'font-medium', children: 'Sesje Bota' }),
        jsx('div', { className: 'text-(--ui-text-tertiary)', children: 'Wybierz Bota w Bot Mode, aby zobaczyć jego sesje.' })
      ]
    })
  }

  const rows = Array.isArray(sessions.data) ? sessions.data : []
  const searchRows = Array.isArray(matches.data) ? matches.data : []
  const searching = Boolean(searchQuery)
  const queryTerms = terms(searchQuery)
  // Keep the pane visibly responsive while the full-history FTS request is in
  // flight or unavailable: titles/previews filter immediately, then BM25 results
  // replace this local fallback as soon as the backend answers.
  const localSearchRows = searching
    ? rows.filter(row => {
        const haystack = normalized(`${sessionLabel(row, profile)}\n${row?.preview || ''}`)
        return queryTerms.every(term => haystack.includes(term))
      })
    : rows
  const rankedSearch = searching && Array.isArray(matches.data)
  const rendered = searching ? (rankedSearch ? searchRows : localSearchRows) : rows
  const searchErrorText = matches.isError
    ? String(matches.error?.message || 'brak szczegółów').replace(/\s+/g, ' ').slice(0, 160)
    : ''

  let body
  if (searching && matches.isLoading && localSearchRows.length === 0) body = jsx('div', { className: 'p-3 text-xs text-(--ui-text-tertiary)', children: 'Szukam w pełnej historii sesji…' })
  else if (searching && matches.isError && localSearchRows.length === 0) body = jsx('div', { className: 'p-3 text-xs text-(--ui-accent)', children: `Wyszukiwanie pełnej historii nie zadziałało: ${searchErrorText}` })
  else if (searching && rankedSearch && searchRows.length === 0) body = jsx('div', { className: 'p-3 text-xs text-(--ui-text-tertiary)', children: 'Brak dopasowań w komunikacji tego Bota.' })
  else if (!searching && sessions.isLoading) body = jsx('div', { className: 'p-3 text-xs text-(--ui-text-tertiary)', children: 'Ładowanie sesji…' })
  else if (!searching && sessions.isError) body = jsx('div', { className: 'p-3 text-xs text-(--ui-accent)', children: 'Nie udało się pobrać sesji tego Bota.' })
  else if (!searching && rows.length === 0) body = jsx('div', { className: 'p-3 text-xs text-(--ui-text-tertiary)', children: 'Ten Bot nie ma jeszcze zapisanych sesji.' })
  else {
    body = jsx('div', {
      className: 'min-h-0 flex-1 overflow-y-auto p-1',
      children: rendered.map(item => {
        const row = rankedSearch ? (item.row || item) : item
        return jsxs('button', {
          type: 'button',
          title: sessionLabel(row, profile),
          onClick: () => open(row),
          disabled: Boolean(openingSession),
          'aria-busy': openingSession === String(row?.resolved_id || row?.id || ''),
          className: 'flex w-full min-w-0 flex-col gap-0.5 rounded px-2 py-2 text-left hover:bg-(--chrome-action-hover) disabled:cursor-wait disabled:opacity-55',
          children: [
            jsxs('span', {
              className: 'flex min-w-0 items-center justify-between gap-2',
              children: [
                jsx('span', { className: 'truncate text-(--ui-text-secondary)', children: sessionLabel(row, profile) }),
                rankedSearch ? jsx('span', { className: 'shrink-0 text-[0.625rem] text-(--ui-accent)', children: `${item.confidence}%` }) : null
              ]
            }),
            rankedSearch
              ? jsx('span', { className: 'line-clamp-2 text-[0.6875rem] text-(--ui-text-tertiary)', children: item.snippet })
              : jsx('span', { className: 'truncate text-[0.6875rem] text-(--ui-text-quaternary)', children: sessionTime(row) }),
            rankedSearch ? jsx('span', { className: 'text-[0.625rem] text-(--ui-text-quaternary)', children: `${sessionTime(row)} · trafność ${item.confidence}%` }) : null
          ]
        }, String(row?.id || row?.resolved_id))
      })
    })
  }

  return jsxs('div', {
    className: 'flex h-full min-w-0 flex-col text-sm',
    children: [
      jsxs('div', {
        className: 'flex shrink-0 flex-col gap-2 border-b border-(--ui-stroke-secondary) px-3 py-2',
        children: [
          jsxs('div', {
            className: 'flex items-center justify-between gap-2',
            children: [
              jsxs('div', {
                className: 'min-w-0',
                children: [
                  jsx('div', { className: 'truncate font-medium', children: 'Sesje Bota' }),
                  jsx('div', { className: 'truncate text-xs text-(--ui-text-tertiary)', children: `@${profile}` })
                ]
              }),
              jsx('button', {
                type: 'button',
                className: 'rounded px-2 py-1 text-xs text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground disabled:opacity-50',
                onClick: createSession,
                disabled: creating,
                title: 'Utwórz nową sesję dla tego Bota',
                children: creating ? 'Tworzę…' : 'Nowa sesja'
              })
            ]
          }),
          jsx('input', {
            type: 'search',
            value: query,
            onChange: event => setQuery(event.target.value),
            placeholder: 'Szukaj w całej historii sesji…',
            className: 'h-8 w-full rounded border border-(--ui-stroke-secondary) bg-transparent px-2 text-xs outline-none placeholder:text-(--ui-text-quaternary) focus:border-(--ui-accent)',
            title: 'Przeszukuje pełną komunikację w sesjach wybranego Bota'
          }),
          jsxs('div', {
            className: 'flex items-center justify-between gap-2 text-[0.6875rem] text-(--ui-text-quaternary)',
            children: [
              jsx('span', {
                children: !searching
                  ? `${rows.length} zapisanych sesji`
                  : matches.isLoading
                    ? 'Szukam w pełnej historii…'
                    : matches.isError
                      ? 'FTS niedostępne — pokazuję dopasowania tytułu i podglądu.'
                      : `${searchRows.length} wyników · ranking FTS/BM25`
              }),
              jsx('button', {
                type: 'button',
                className: 'rounded px-1.5 py-0.5 hover:bg-(--chrome-action-hover) hover:text-foreground',
                onClick: () => searching ? matches.refetch() : sessions.refetch(),
                children: 'Odśwież'
              })
            ]
          })
        ]
      }),
      body
    ]
  })
}

export default {
  id: ID,
  name: 'Bot Session Pane — persistent',
  register(ctx) {
    ctx.register({
      id: 'sessions-v2',
      area: 'panes',
      title: 'Sesje Bota',
      data: {
        placement: 'main',
        dock: { pane: 'workspace', pos: 'right', enforce: true },
        width: '320px',
        uncloseable: true
      },
      render: () => jsx(BotSessionPane, {})
    })
  }
}
