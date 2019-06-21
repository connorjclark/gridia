import Client from './client';

abstract class ClientModule {
  constructor(public game: any, public client: Client) {}

  public abstract onStart();
}

export default ClientModule;
