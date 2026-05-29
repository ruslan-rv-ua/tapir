/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Welcome_First_RunInputs */

const uk_welcome_first_run = /** @type {(inputs: Welcome_First_RunInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Ласкаво просимо до Tapir. Натисніть Enter щоб додати перший потік.`)
};

const en_welcome_first_run = /** @type {(inputs: Welcome_First_RunInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Welcome to Tapir. Press Enter to add your first stream.`)
};

/**
* | output |
* | --- |
* | "Welcome to Tapir. Press Enter to add your first stream." |
*
* @param {Welcome_First_RunInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const welcome_first_run = /** @type {((inputs?: Welcome_First_RunInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Welcome_First_RunInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_welcome_first_run(inputs)
	return en_welcome_first_run(inputs)
});