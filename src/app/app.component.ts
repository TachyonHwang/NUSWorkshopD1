import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { Link, LinksService } from './links.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  private readonly api = inject(LinksService);
  readonly url = signal('');
  readonly links = signal<Link[]>([]);
  readonly created = signal<Link | null>(null);
  readonly saving = signal(false);
  readonly loading = signal(false);
  readonly formError = signal('');
  readonly listError = signal('');

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.listError.set('');
    this.api.list().pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (links) => this.links.set(links),
      error: (error: HttpErrorResponse) => this.listError.set(this.errorMessage(error))
    });
  }

  shorten(event: Event): void {
    event.preventDefault();
    if (this.saving() || this.loading()) return;
    this.formError.set('');
    this.created.set(null);
    const url = this.url().trim();
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      this.formError.set('Enter a valid URL starting with http:// or https://.');
      return;
    }

    this.saving.set(true);
    this.api.create(url).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (link) => {
        this.created.set(link);
        this.links.update((links) => [...links, link]);
        this.url.set('');
      },
      error: (error: HttpErrorResponse) => this.formError.set(this.errorMessage(error))
    });
  }

  private errorMessage(error: HttpErrorResponse): string {
    if (error.status === 0) return 'Cannot reach the backend at http://localhost:3000.';
    return typeof error.error?.error === 'string'
      ? error.error.error
      : `Request failed (${error.status}). Please try again.`;
  }
}
