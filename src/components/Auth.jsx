import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Button } from './ui/button'
import { Input } from './ui/input'

export default function Auth() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
    })
    
    if (error) {
      setMessage(error.error_description || error.message)
    } else {
      setMessage('Check your email for the login link!')
    }
    setLoading(false)
  }

  return (
    <div className="flex justify-center items-center h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-4 bg-white rounded-lg shadow-md -mt-20">
        <div className="text-center">
          <h1 className="text-2xl font-bold">AsyncComm</h1>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Input
              type="email"
              placeholder="Your email address"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button className="w-full" disabled={loading}>
            {loading ? 'Sending link...' : 'Send login link'}
          </Button>
        </form>
        {message && (
          <div className="text-sm text-center text-gray-700 bg-gray-100 p-2 rounded">
            {message}
          </div>
        )}
      </div>
    </div>
  )
}