import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
            <SignUp />
        </div>
    )
}
