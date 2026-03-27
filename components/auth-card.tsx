import Link from "next/link";

interface AuthCardProps {
  eyebrow: string;
  title: string;
  description: string;
  mode: "login" | "signup";
  error?: string;
  message?: string;
  googleAction: (formData: FormData) => Promise<void>;
  emailAction: (formData: FormData) => Promise<void>;
}

export function AuthCard({
  eyebrow,
  title,
  description,
  mode,
  error,
  message,
  googleAction,
  emailAction,
}: AuthCardProps) {
  return (
    <main className="mainContent authPage">
      <section className="hero authHero">
        <div className="heroCopy">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="heroText">{description}</p>
        </div>

        <div className="authPanel">
          {error ? <p className="authError">{error}</p> : null}
          {message ? <p className="authMessage">{message}</p> : null}

          <form action={googleAction} className="authStack">
            <button className="searchButton" type="submit">
              Continue with Google
            </button>
          </form>

          <div className="authDivider">
            <span>or use email</span>
          </div>

          <form action={emailAction} className="authStack">
            {mode === "signup" ? (
              <label className="authField">
                <span>Name</span>
                <input
                  className="searchInput"
                  type="text"
                  name="username"
                  minLength={3}
                  maxLength={10}
                  pattern="[A-Za-z0-9_]+"
                  required
                />
              </label>
            ) : null}
            <label className="authField">
              <span>Email</span>
              <input className="searchInput" type="email" name="email" required />
            </label>
            <label className="authField">
              <span>Password</span>
              <input className="searchInput" type="password" name="password" minLength={8} required />
            </label>
            <button className="searchButton" type="submit">
              {mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>

          <p className="authSwitch">
            {mode === "login" ? "Need an account?" : "Already have an account?"}{" "}
            <Link href={mode === "login" ? "/signup" : "/login"}>
              {mode === "login" ? "Sign up" : "Log in"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
