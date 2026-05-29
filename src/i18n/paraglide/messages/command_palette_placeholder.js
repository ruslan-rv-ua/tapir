/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Command_Palette_PlaceholderInputs */

const uk_command_palette_placeholder = /** @type {(inputs: Command_Palette_PlaceholderInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Введіть команду або назву потоку...`)
};

const en_command_palette_placeholder = /** @type {(inputs: Command_Palette_PlaceholderInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Enter a command or stream name...`)
};

/**
* | output |
* | --- |
* | "Enter a command or stream name..." |
*
* @param {Command_Palette_PlaceholderInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const command_palette_placeholder = /** @type {((inputs?: Command_Palette_PlaceholderInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Command_Palette_PlaceholderInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_command_palette_placeholder(inputs)
	return en_command_palette_placeholder(inputs)
});