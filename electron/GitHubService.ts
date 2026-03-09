export class GitHubService {
  private octokit: any | null = null;
  private token: string | null = null;
  private username: string | null = null;

  async authenticate(token: string): Promise<boolean> {
    try {
      // Using new Function to prevent TypeScript from compiling dynamic import into require()
      const _importDynamic = new Function('modulePath', 'return import(modulePath)');
      const { Octokit } = await _importDynamic('octokit');
      this.octokit = new Octokit({ auth: token });
      
      // Validate the token by calling the rate limit endpoint (works with any valid token)
      await this.octokit.rest.rateLimit.get();
      
      this.token = token;
      
      // Try fetching the username for display
      try {
         const { data } = await this.octokit.rest.users.getAuthenticated();
         this.username = data?.login || null;
         console.log('GitHub Authenticated as:', this.username);
      } catch {
         this.username = null;
         console.log('GitHub Authenticated (Token valid, but user scope not available).');
      }

      return true;
    } catch (e) {
      console.error('GitHub Auth Error:', (e as Error).message);
      this.octokit = null;
      this.token = null;
      this.username = null;
      return false;
    }
  }

  isAuthenticated(): boolean {
    return this.octokit !== null;
  }

  getUsername(): string | null {
    return this.username;
  }

  async getMyRepositories() {
    if (!this.octokit) throw new Error('Not authenticated');
    
    const { data } = await this.octokit.rest.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 50
    });
    
    return data.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      cloneUrl: repo.clone_url,
      description: repo.description,
      updatedAt: repo.updated_at
    }));
  }

  async getPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open') {
    if (!this.octokit) throw new Error('Not authenticated');

    const { data } = await this.octokit.rest.pulls.list({
      owner,
      repo,
      state,
      per_page: 30,
      sort: 'updated',
      direction: 'desc'
    });

    return data.map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      user: pr.user?.login || '',
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      head: pr.head?.ref || '',
      base: pr.base?.ref || '',
      merged: pr.merged_at !== null,
      htmlUrl: pr.html_url,
      draft: pr.draft || false,
    }));
  }

  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string
  ) {
    if (!this.octokit) throw new Error('Not authenticated');

    const { data } = await this.octokit.rest.pulls.create({
      owner,
      repo,
      title,
      body,
      head,
      base,
    });

    return {
      number: data.number,
      title: data.title,
      htmlUrl: data.html_url,
      state: data.state,
    };
  }
}

export const githubService = new GitHubService();
