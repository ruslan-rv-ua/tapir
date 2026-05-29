/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Commands_LabelInputs */

const uk_commands_label = /** @type {(inputs: Commands_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Команди`)
};

const en_commands_label = /** @type {(inputs: Commands_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Commands`)
};

/**
* | output |
* | --- |
* | "Commands" |
*
* @param {Commands_LabelInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const commands_label = /** @type {((inputs?: Commands_LabelInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Commands_LabelInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_commands_label(inputs)
	return en_commands_label(inputs)
});