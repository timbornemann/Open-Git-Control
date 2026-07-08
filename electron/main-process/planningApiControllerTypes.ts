export type RouteHandlerResult = {
  handled: true;
  value: unknown;
} | {
  handled: false;
};

export const routeHandled = (value: unknown): RouteHandlerResult => ({
  handled: true,
  value,
});

export const routeNotHandled: RouteHandlerResult = {
  handled: false,
};
