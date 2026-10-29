import { SetMetadata } from "@nestjs/common";

export const NOT_IN_DEMO_KEY = "notInDemo";

/**
 * Refuses the route in a demo company. For actions that reach people outside the app, like
 * sending an invitation e-mail, which an anonymous demo visitor shouldn't be able to trigger.
 */
export const NotInDemo = (): MethodDecorator & ClassDecorator => SetMetadata(NOT_IN_DEMO_KEY, true);
