import type { FormEvent } from "react";

/**
 * Props экрана авторизации.
 */
export type AuthScreenProps = {
  /** Текущее значение поля пароля. */
  passwordInput: string;
  /** Текст ошибки авторизации. Пустая строка означает, что ошибки нет. */
  authError: string;
  /** Обработчик изменения поля пароля. */
  onPasswordChange: (value: string) => void;
  /** Обработчик отправки формы авторизации. */
  onLogin: (event: FormEvent) => void;
};

/**
 * Экран авторизации с формой ввода пароля.
 *
 * Компонент не знает, как проверяется пароль и где хранится токен:
 * вся логика авторизации передается через props.
 */
export function AuthScreen({ passwordInput, authError, onPasswordChange, onLogin }: AuthScreenProps) {
  return (
    <div className="flex h-screen items-center justify-center bg-bg p-6">
      <div className="app-panel w-full max-w-sm p-7 text-center shadow-custom">
        <h1 className="mb-6 text-[2rem] font-light text-text">Learn Helper</h1>
        <form onSubmit={onLogin} className="flex flex-col gap-4">
          <input
            type="password"
            placeholder="Введите пароль"
            className="app-input rounded-[3px] px-3 py-2.5 text-sm outline-none focus:border-accent"
            value={passwordInput}
            onChange={(event) => onPasswordChange(event.target.value)}
            autoFocus
          />
          {authError && <p className="text-danger text-sm">{authError}</p>}
          <button
            type="submit"
            className="app-button flex h-10 items-center justify-center px-4 text-sm"
          >
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}
