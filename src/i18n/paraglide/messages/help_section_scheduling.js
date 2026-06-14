/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Help_Section_SchedulingInputs */

const uk_help_section_scheduling = /** @type {(inputs: Help_Section_SchedulingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Розклад`)
};

const en_help_section_scheduling = /** @type {(inputs: Help_Section_SchedulingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Scheduling`)
};

/**
* | output |
* | --- |
* | "Scheduling" |
*
* @param {Help_Section_SchedulingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const help_section_scheduling = /** @type {((inputs?: Help_Section_SchedulingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Help_Section_SchedulingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_help_section_scheduling(inputs)
	return en_help_section_scheduling(inputs)
});