import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders Snip and loads links', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('http://localhost:3000/api/links').flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Snip');
    expect(fixture.nativeElement.textContent).toContain('No links yet.');
  });

  it('rejects non-http URLs without making a request', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.componentInstance.url.set('javascript:alert(1)');
    fixture.componentInstance.shorten(new Event('submit'));
    expect(fixture.componentInstance.formError()).toContain('http:// or https://');
    http.expectNone('http://localhost:3000/api/links');
  });

  it('shows the created short link and adds it to the table state', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.componentInstance.url.set(' https://example.com ');
    fixture.componentInstance.shorten(new Event('submit'));
    const request = http.expectOne('http://localhost:3000/api/links');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ url: 'https://example.com' });
    const link = {
      code: 'Ab12Cd', url: 'https://example.com',
      shortUrl: 'http://localhost:3000/Ab12Cd', hits: 0,
      createdAt: '2026-10-29T00:00:00.000Z'
    };
    request.flush(link);
    expect(fixture.componentInstance.created()).toEqual(link);
    expect(fixture.componentInstance.links()).toEqual([link]);
    expect(fixture.componentInstance.saving()).toBeFalse();
  });
});