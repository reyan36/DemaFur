import Link from 'next/link';

export default function Login() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black tracking-tighter text-black">Welcome back.</h1>
          <p className="text-sm text-gray-500 font-medium mt-2">Sign in to your DemaFur account</p>
        </div>

        <form className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-black mb-1">
              Email
            </label>
            <input 
              type="email" 
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-black focus:ring-2 focus:ring-black outline-none transition-all"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-black mb-1">
              Password
            </label>
            <input 
              type="password" 
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-black focus:ring-2 focus:ring-black outline-none transition-all"
              placeholder="••••••••"
            />
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center space-x-2 text-gray-600">
              <input type="checkbox" className="rounded border-gray-300 text-black focus:ring-black" />
              <span className="font-medium">Remember me</span>
            </label>
            <Link href="#" className="text-black hover:underline font-bold">
              Forgot password?
            </Link>
          </div>

          <button className="w-full bg-black hover:bg-gray-800 text-white font-bold py-3 px-4 rounded-xl transition-colors mt-6">
            Sign in
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 font-medium mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-black hover:underline font-bold">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
