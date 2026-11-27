import { BrowserRouter } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import AuthScreen from './components/auth/AuthScreen'
import SetupScreen from './components/auth/SetupScreen'
import MainLayout from './components/MainLayout'
import { Button } from './components/ui/button'
import { Spinner } from './components/ui/spinner'
import { ToastProvider } from './components/ui/toast'
import { ChatsProvider } from './hooks/ChatsProvider'
import { useAuth } from './hooks/useAuth'
import { signOut } from './lib/api/auth'
import { isSupabaseConfigured } from './lib/supabase'

function Splash() {
  return (
    <div className="flex h-dvh items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white"><MessageCircle className="h-7 w-7" /></div>
        <Spinner className="h-5 w-5" />
      </div>
    </div>
  )
}

function Notice({ title, children, action }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-gray-50 px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="mt-2 text-gray-600">{children}</div>
        {action}
      </div>
    </div>
  )
}

function AuthGate() {
  const auth = useAuth()

  switch (auth.status) {
    case 'loading':
      return <Splash />
    case 'signedOut':
      return <AuthScreen />
    case 'profileError':
      return (
        <Notice
          title="Couldn't load your account"
          action={
            <div className="mt-5 flex justify-center gap-2">
              <Button onClick={auth.retryProfile}>Try again</Button>
              <Button variant="outline" onClick={signOut}>Log out</Button>
            </div>
          }
        >
          <p>Check your connection, and make sure the database migrations in <code>migrations/</code> have been run.</p>
        </Notice>
      )
    case 'needsSetup':
      return <SetupScreen user={auth.user} profile={auth.profile} isRecovery={auth.isRecovery} onDone={auth.finishSetup} />
    default:
      return (
        <ChatsProvider userId={auth.user.id}>
          <MainLayout user={auth.user} profile={auth.profile} onProfileChanged={auth.refreshProfile} />
        </ChatsProvider>
      )
  }
}

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <Notice title="Supabase isn't configured">
        <p>
          Copy <code>.env.example</code> to <code>.env.local</code> and fill in <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>, then restart <code>npm run dev</code>.
        </p>
      </Notice>
    )
  }
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthGate />
      </ToastProvider>
    </BrowserRouter>
  )
}
