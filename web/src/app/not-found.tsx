import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DevSyncLogo } from "@/components/brand/devsync-logo"

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="DevSync home">
            <DevSyncLogo />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back home
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center px-6 py-14">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">404</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          This page does not exist.
        </h1>
        <p className="mt-3 text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist. Check the URL, or start
          a new room.
        </p>
        <Button asChild className="mt-8 w-full max-sm:h-10 sm:w-fit">
          <Link href="/collaborate">Start a room</Link>
        </Button>
      </main>
    </div>
  )
}
