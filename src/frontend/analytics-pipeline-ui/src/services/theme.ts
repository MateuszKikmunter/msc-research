import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly storageKey = 'analytics-pipeline-theme';
  private readonly theme = signal<Theme>(this.getInitialTheme());

  readonly isDark = () => this.theme() === 'dark';

  constructor() {
    this.applyTheme(this.theme());
  }

  toggle(): void {
    const theme: Theme = this.isDark() ? 'light' : 'dark';
    this.theme.set(theme);
    this.applyTheme(theme);
    localStorage.setItem(this.storageKey, theme);
  }

  private getInitialTheme(): Theme {
    const savedTheme = localStorage.getItem(this.storageKey);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }

    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private applyTheme(theme: Theme): void {
    this.document.documentElement.classList.toggle('dark-theme', theme === 'dark');
    this.document.documentElement.style.colorScheme = theme;
  }
}
