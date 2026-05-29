/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Empty_ConditionsInputs */

const uk_empty_conditions = /** @type {(inputs: Empty_ConditionsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`без умов`)
};

const en_empty_conditions = /** @type {(inputs: Empty_ConditionsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`no conditions`)
};

/**
* | output |
* | --- |
* | "no conditions" |
*
* @param {Empty_ConditionsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const empty_conditions = /** @type {((inputs?: Empty_ConditionsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Empty_ConditionsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_empty_conditions(inputs)
	return en_empty_conditions(inputs)
});