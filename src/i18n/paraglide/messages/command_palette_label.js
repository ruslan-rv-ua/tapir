/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Command_Palette_LabelInputs */

const uk_command_palette_label = /** @type {(inputs: Command_Palette_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Командна палітра`)
};

const en_command_palette_label = /** @type {(inputs: Command_Palette_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Command palette`)
};

/**
* | output |
* | --- |
* | "Command palette" |
*
* @param {Command_Palette_LabelInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const command_palette_label = /** @type {((inputs?: Command_Palette_LabelInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Command_Palette_LabelInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_command_palette_label(inputs)
	return en_command_palette_label(inputs)
});