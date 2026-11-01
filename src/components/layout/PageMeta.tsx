import * as React from 'react'

interface PageMetaValue {
  title: string
  description?: string
  action?: React.ReactNode
}

const PageMetaContext = React.createContext<{
  value: PageMetaValue
  set: (next: PageMetaValue) => void
} | null>(null)

export function PageMetaProvider({ children }: { children: React.ReactNode }) {
  const [value, set] = React.useState<PageMetaValue>({ title: 'Dashboard' })
  return (
    <PageMetaContext.Provider value={{ value, set }}>
      {children}
    </PageMetaContext.Provider>
  )
}

export function usePageMetaContext() {
  const ctx = React.useContext(PageMetaContext)
  if (!ctx)
    throw new Error('usePageMetaContext must be used within PageMetaProvider')
  return ctx
}

export function usePageMeta(meta: PageMetaValue) {
  const { set } = usePageMetaContext()
  const key = `${meta.title}|${meta.description ?? ''}`
  React.useEffect(() => {
    set(meta)
    document.title = `${meta.title} · HireMeBot Recruiter`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, meta.action])
}
