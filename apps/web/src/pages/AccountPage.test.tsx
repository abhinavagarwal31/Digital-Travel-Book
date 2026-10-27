import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASHA, mockApi, renderApp, UNAUTHENTICATED } from '../test/renderApp.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ACCOUNT = {
  user: ASHA,
  plan: 'free',
  photoLimit: 200,
  usage: {
    books: 2,
    photos: 15,
    fullestBook: { id: 'b1', title: 'Whispers of Japan', photos: 12 },
  },
};

function account(extra: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    'GET /auth/me': { status: 200, body: { user: ASHA } },
    'GET /account': { status: 200, body: { account: ACCOUNT } },
    ...extra,
  });
  renderApp('/account');
  return calls;
}

const sent = (calls: ReturnType<typeof mockApi>, method: string, path: string) =>
  calls.filter((c) => c.method === method && c.path === path).map((c) => c.body);

describe('the account page', () => {
  it('is one click from the header, and shows the plan and what is used', async () => {
    account();
    expect(
      (await screen.findByRole('link', { name: `Your account: ${ASHA.name}` })).getAttribute(
        'href',
      ),
    ).toBe('/account');
    const plan = await screen.findByRole('region', { name: /Your plan/ });
    expect(within(plan).getByText('Free')).toBeTruthy();
    expect(within(plan).getByText('up to 200')).toBeTruthy();
    expect(
      within(plan).getByRole('meter', { name: 'Whispers of Japan: 12 of 200 photos' }),
    ).toBeTruthy();
    expect(within(plan).getByRole('link', { name: 'Compare plans' }).getAttribute('href')).toBe(
      '/plans',
    );
  });

  it('renames without a password, and asks for it only when the email changes', async () => {
    const calls = account({
      'PATCH /account': {
        status: 200,
        body: { account: { ...ACCOUNT, user: { ...ASHA, name: 'Asha R' } } },
      },
    });
    const name = await screen.findByLabelText('Name');
    expect(screen.queryByLabelText('Current password', { selector: '#profile input' })).toBeNull();
    fireEvent.change(name, { target: { value: 'Asha R' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(sent(calls, 'PATCH', '/account')).toEqual([{ name: 'Asha R' }]));
    expect(await screen.findByText('Saved.')).toBeTruthy();

    const profile = screen.getByRole('form', { name: 'Profile' });
    fireEvent.change(within(profile).getByLabelText('Email'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.click(within(profile).getByRole('button', { name: 'Save changes' }));
    expect(
      await within(profile).findByText('Enter your password to change your email'),
    ).toBeTruthy();
    expect(sent(calls, 'PATCH', '/account')).toHaveLength(1);
  });

  it('changes the password and says the other devices are logged out', async () => {
    const calls = account({ 'PUT /account/password': { status: 204, body: null } });
    const form = await screen.findByRole('form', { name: 'Password' });
    fireEvent.change(within(form).getByLabelText('Current password'), {
      target: { value: 'old-one-123' },
    });
    fireEvent.change(within(form).getByLabelText('New password'), {
      target: { value: 'new-one-456' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Change password' }));
    await waitFor(() =>
      expect(sent(calls, 'PUT', '/account/password')).toEqual([
        { currentPassword: 'old-one-123', newPassword: 'new-one-456' },
      ]),
    );
    expect(await screen.findByText(/Any other devices have been logged out/)).toBeTruthy();
  });

  it('deletes the account only with the password, then leaves', async () => {
    const calls = account({
      'DELETE /account': { status: 204, body: null },
      'GET /books': UNAUTHENTICATED,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete account…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account and all my books' }));
    expect(await screen.findByText('Enter your password')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Your password, to confirm'), {
      target: { value: 'correct horse' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account and all my books' }));
    await waitFor(() =>
      expect(sent(calls, 'DELETE', '/account')).toEqual([{ password: 'correct horse' }]),
    );
    expect(await screen.findByRole('link', { name: 'Get started' })).toBeTruthy();
  });
});

describe('the plans page', () => {
  it('shows Free as your plan and Pro as coming, with nothing to buy', async () => {
    mockApi({
      'GET /auth/me': { status: 200, body: { user: ASHA } },
      'GET /account': { status: 200, body: { account: ACCOUNT } },
    });
    renderApp('/plans');
    const free = await screen.findByRole('article', { name: /Free/ });
    expect(await within(free).findByText('Your plan')).toBeTruthy();
    expect(within(free).getByText('Up to 200 photos in each book')).toBeTruthy();
    const pro = screen.getByRole('article', { name: /Pro/ });
    expect(within(pro).getByText('Up to 500 photos in each book')).toBeTruthy();
    expect(within(pro).getByRole('button', { name: 'Not available yet' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByText(/nothing is ever charged/)).toBeTruthy();
  });

  it('invites a visitor to start for free', async () => {
    mockApi({ 'GET /auth/me': UNAUTHENTICATED });
    renderApp('/plans');
    expect((await screen.findByRole('link', { name: 'Start for free' })).getAttribute('href')).toBe(
      '/register',
    );
  });
});
