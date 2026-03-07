export class GitHubService {
  private octokit: any | null = null;
  private token: string | null = null;

  async authenticate(token: string): Promise<boolean> {
    try {
      const { Octokit } = await import('octokit');
      this.octokit = new Octokit({ auth: token });
      const { data } = await this.octokit.rest.users.getAuthenticated();
      this.token = token;
      console.log('GitHub Authenticated as:', data.login);
      return true;
    } catch (e) {
      console.error('GitHub Auth Error:', e);
      this.octokit = null;
      this.token = null;
      return false;
    }
  }

  isAuthenticated(): boolean {
    return this.octokit !== null;
  }

  async getMyRepositories() {
    if (!this.octokit) throw new Error('Not authenticated');
    
    // Fetch user's own repositories
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
}

export const githubService = new GitHubService();
