/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Schedule_SectionInputs */

const uk_schedule_section = /** @type {(inputs: Schedule_SectionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Розклад`)
};

const en_schedule_section = /** @type {(inputs: Schedule_SectionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Schedule`)
};

/**
* | output |
* | --- |
* | "Schedule" |
*
* @param {Schedule_SectionInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const schedule_section = /** @type {((inputs?: Schedule_SectionInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Schedule_SectionInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_schedule_section(inputs)
	return en_schedule_section(inputs)
});