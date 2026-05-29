/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Active_Recordings_OneInputs */

const uk_active_recordings_one = /** @type {(inputs: Active_Recordings_OneInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} запис`)
};

const en_active_recordings_one = /** @type {(inputs: Active_Recordings_OneInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} recording`)
};

/**
* | output |
* | --- |
* | "{count} recording" |
*
* @param {Active_Recordings_OneInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const active_recordings_one = /** @type {((inputs: Active_Recordings_OneInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Active_Recordings_OneInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_active_recordings_one(inputs)
	return en_active_recordings_one(inputs)
});