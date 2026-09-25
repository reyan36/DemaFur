import Link from 'next/link';

export default function Signup() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black tracking-tighter text-black">Create account.</h1>
          <p className="text-sm text-gray-500 font-medium mt-2">Get started with DemaFur security</p>
        </div>

        <form className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-black mb-1">
              Full Name
            </label>
            <input 
              type="text" 
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-black focus:ring-2 focus:ring-black outline-none transition-all"
              placeholder="Jane Doe"
            />
          </div>
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

          <button className="w-full bg-black hover:bg-gray-800 text-white font-bold py-3 px-4 rounded-xl transition-colors mt-6">
            Sign up
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 font-medium mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-black hover:underline font-bold">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
