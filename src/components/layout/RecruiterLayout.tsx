import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import {
  PageMetaProvider,
  usePageMetaContext,
} from './PageMeta'

function LayoutShell() {
  const { value } = usePageMetaContext()
  return (
    <div className="flex h-screen overflow-hidden bg-brand-bg">
      <div className="sticky top-0 h-screen">
        <Sidebar />
      </div>
      <div className="flex h-screen min-w-0 flex-1 flex-col">
        <Header
          title={value.title}
          description={value.description}
          action={value.action}
        />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto w-full max-w-[1400px] px-8 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export function RecruiterLayout() {
  return (
    <PageMetaProvider>
      <LayoutShell />
    </PageMetaProvider>
  )
}
