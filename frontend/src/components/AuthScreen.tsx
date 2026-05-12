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
    <div className="flex h-screen items-center justify-center bg-[#f6f7f3]">
      <div className="p-8 bg-surface border border-line rounded-lg shadow-xl text-center w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-text">Learn Helper</h1>
        <form onSubmit={onLogin} className="flex flex-col gap-4">
          <input
            type="password"
            placeholder="Введите пароль"
            className="p-3 border border-line rounded-lg text-text"
            value={passwordInput}
            onChange={(event) => onPasswordChange(event.target.value)}
            autoFocus
          />
          {authError && <p className="text-danger text-sm">{authError}</p>}
          <button
            type="submit"
            className="px-4 py-3 bg-accent text-white font-bold rounded-lg hover:bg-accent-strong transition-colors"
          >
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}
