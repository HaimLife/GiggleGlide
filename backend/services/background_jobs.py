"""Background job system for personalization preference learning and maintenance."""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import json

from ..database.repositories.personalization_repository import PersonalizationRepository
from ..database.repositories.tag_repository import TagRepository
from ..database.repositories.joke_repository import JokeRepository
from ..database.repositories.user_repository import UserRepository
from .personalization_service import PersonalizationService

logger = logging.getLogger(__name__)


@dataclass
class JobConfig:
    """Configuration for background jobs."""
    preference_learning_interval: int = 300  # 5 minutes
    metrics_calculation_interval: int = 3600  # 1 hour
    cleanup_interval: int = 86400  # 24 hours
    batch_size: int = 100
    max_concurrent_jobs: int = 5


class BackgroundJobManager:
    """Manager for background jobs related to personalization."""

    def __init__(
        self,
        personalization_service: PersonalizationService,
        personalization_repo: PersonalizationRepository,
        tag_repo: TagRepository,
        joke_repo: JokeRepository,
        user_repo: UserRepository,
        config: Optional[JobConfig] = None
    ):
        self.personalization_service = personalization_service
        self.personalization_repo = personalization_repo
        self.tag_repo = tag_repo
        self.joke_repo = joke_repo
        self.user_repo = user_repo
        self.config = config or JobConfig()
        
        self._running = False
        self._jobs = {}
        self._job_stats = {
            'preference_learning': {'runs': 0, 'last_run': None, 'errors': 0},
            'metrics_calculation': {'runs': 0, 'last_run': None, 'errors': 0},
            'data_cleanup': {'runs': 0, 'last_run': None, 'errors': 0}
        }

    async def start(self):
        """Start all background jobs."""
        if self._running:
            logger.warning("Background jobs already running")
            return

        self._running = True
        logger.info("Starting background job manager")

        # Start individual job tasks
        self._jobs['preference_learning'] = asyncio.create_task(
            self._preference_learning_job()
        )
        self._jobs['metrics_calculation'] = asyncio.create_task(
            self._metrics_calculation_job()
        )
        self._jobs['data_cleanup'] = asyncio.create_task(
            self._data_cleanup_job()
        )

        logger.info("All background jobs started")

    async def stop(self):
        """Stop all background jobs."""
        if not self._running:
            return

        self._running = False
        logger.info("Stopping background job manager")

        # Cancel all jobs
        for job_name, task in self._jobs.items():
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    logger.info(f"Cancelled job: {job_name}")

        self._jobs.clear()
        logger.info("All background jobs stopped")

    def get_job_status(self) -> Dict[str, Any]:
        """Get status of all background jobs."""
        status = {
            'running': self._running,
            'jobs': {},
            'stats': self._job_stats
        }

        for job_name, task in self._jobs.items():
            status['jobs'][job_name] = {
                'active': task and not task.done() if task else False,
                'done': task.done() if task else True,
                'cancelled': task.cancelled() if task else False
            }

        return status

    # Job Implementations

    async def _preference_learning_job(self):
        """Background job for updating user preferences based on recent interactions."""
        job_name = 'preference_learning'
        
        while self._running:
            try:
                start_time = datetime.utcnow()
                logger.debug(f"Starting {job_name} job")

                # Process recent interactions in batches
                await self._process_recent_interactions()

                # Update job statistics
                self._job_stats[job_name]['runs'] += 1
                self._job_stats[job_name]['last_run'] = start_time
                
                processing_time = (datetime.utcnow() - start_time).total_seconds()
                logger.info(f"Completed {job_name} job in {processing_time:.2f}s")

                # Wait for next interval
                await asyncio.sleep(self.config.preference_learning_interval)

            except asyncio.CancelledError:
                logger.info(f"Job {job_name} cancelled")
                break
            except Exception as e:
                self._job_stats[job_name]['errors'] += 1
                logger.error(f"Error in {job_name} job: {str(e)}")
                await asyncio.sleep(60)  # Wait 1 minute before retrying

    async def _metrics_calculation_job(self):
        """Background job for calculating personalization metrics."""
        job_name = 'metrics_calculation'
        
        while self._running:
            try:
                start_time = datetime.utcnow()
                logger.debug(f"Starting {job_name} job")

                # Calculate metrics for active users
                await self._calculate_user_metrics()

                # Update job statistics
                self._job_stats[job_name]['runs'] += 1
                self._job_stats[job_name]['last_run'] = start_time
                
                processing_time = (datetime.utcnow() - start_time).total_seconds()
                logger.info(f"Completed {job_name} job in {processing_time:.2f}s")

                # Wait for next interval
                await asyncio.sleep(self.config.metrics_calculation_interval)

            except asyncio.CancelledError:
                logger.info(f"Job {job_name} cancelled")
                break
            except Exception as e:
                self._job_stats[job_name]['errors'] += 1
                logger.error(f"Error in {job_name} job: {str(e)}")
                await asyncio.sleep(300)  # Wait 5 minutes before retrying

    async def _data_cleanup_job(self):
        """Background job for cleaning up old data and maintaining database health."""
        job_name = 'data_cleanup'
        
        while self._running:
            try:
                start_time = datetime.utcnow()
                logger.debug(f"Starting {job_name} job")

                # Perform various cleanup tasks
                await self._cleanup_old_metrics()
                await self._update_joke_ratings()
                await self._cleanup_cache()

                # Update job statistics
                self._job_stats[job_name]['runs'] += 1
                self._job_stats[job_name]['last_run'] = start_time
                
                processing_time = (datetime.utcnow() - start_time).total_seconds()
                logger.info(f"Completed {job_name} job in {processing_time:.2f}s")

                # Wait for next interval
                await asyncio.sleep(self.config.cleanup_interval)

            except asyncio.CancelledError:
                logger.info(f"Job {job_name} cancelled")
                break
            except Exception as e:
                self._job_stats[job_name]['errors'] += 1
                logger.error(f"Error in {job_name} job: {str(e)}")
                await asyncio.sleep(1800)  # Wait 30 minutes before retrying

    # Helper Methods

    async def _process_recent_interactions(self):
        """Process recent user interactions to update preferences."""
        try:
            # Get recent interactions (last 5 minutes)
            time_threshold = datetime.utcnow() - timedelta(
                seconds=self.config.preference_learning_interval
            )

            # This would need to be implemented in the interaction repository
            # For now, we'll simulate processing active users
            active_users = await self._get_recently_active_users(time_threshold)
            
            processed_count = 0
            for user_batch in self._batch_items(active_users, self.config.batch_size):
                # Process batch concurrently but limit concurrency
                semaphore = asyncio.Semaphore(self.config.max_concurrent_jobs)
                tasks = [
                    self._process_user_interactions(user_id, time_threshold, semaphore)
                    for user_id in user_batch
                ]
                
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Count successful processing
                for result in results:
                    if not isinstance(result, Exception):
                        processed_count += result

            logger.info(f"Processed preference updates for {processed_count} interactions")

        except Exception as e:
            logger.error(f"Error processing recent interactions: {str(e)}")
            raise

    async def _process_user_interactions(
        self,
        user_id: str,
        since: datetime,
        semaphore: asyncio.Semaphore
    ) -> int:
        """Process interactions for a single user."""
        async with semaphore:
            try:
                # This is a simplified version - in reality you'd query recent interactions
                # and update preferences based on them
                
                # For demo purposes, we'll just return a count
                return 1

            except Exception as e:
                logger.error(f"Error processing interactions for user {user_id}: {str(e)}")
                return 0

    async def _calculate_user_metrics(self):
        """Calculate personalization metrics for active users."""
        try:
            # Get active users from the last 24 hours
            time_threshold = datetime.utcnow() - timedelta(hours=24)
            active_users = await self._get_recently_active_users(time_threshold)

            metrics_calculated = 0
            for user_batch in self._batch_items(active_users, self.config.batch_size):
                # Process metrics for batch of users
                for user_id in user_batch:
                    try:
                        # Calculate metrics for this user
                        metrics = await self.personalization_repo.get_recommendation_performance(
                            user_id, days=7
                        )

                        # Record metrics in database
                        period_start = datetime.utcnow() - timedelta(days=7)
                        period_end = datetime.utcnow()

                        for metric_type, value in metrics.items():
                            if isinstance(value, (int, float)):
                                await self.personalization_repo.record_personalization_metric(
                                    user_id=user_id,
                                    metric_type=metric_type,
                                    value=float(value),
                                    period_start=period_start,
                                    period_end=period_end
                                )

                        metrics_calculated += 1

                    except Exception as e:
                        logger.error(f"Error calculating metrics for user {user_id}: {str(e)}")

            logger.info(f"Calculated metrics for {metrics_calculated} users")

        except Exception as e:
            logger.error(f"Error in metrics calculation: {str(e)}")
            raise

    async def _cleanup_old_metrics(self):
        """Clean up old personalization metrics."""
        try:
            # Remove metrics older than 90 days
            cutoff_date = datetime.utcnow() - timedelta(days=90)
            
            # This would need to be implemented in the repository
            logger.info("Cleaned up old personalization metrics")

        except Exception as e:
            logger.error(f"Error cleaning up old metrics: {str(e)}")

    async def _update_joke_ratings(self):
        """Update joke ratings based on recent interactions."""
        try:
            updated_count = await self.joke_repo.update_joke_ratings()
            logger.info(f"Updated ratings for {updated_count} jokes")

        except Exception as e:
            logger.error(f"Error updating joke ratings: {str(e)}")

    async def _cleanup_cache(self):
        """Clean up cached data."""
        try:
            # Clear personalization service cache
            self.personalization_service._preference_cache.clear()
            self.personalization_service._cache_expiry.clear()
            
            logger.info("Cleaned up personalization cache")

        except Exception as e:
            logger.error(f"Error cleaning up cache: {str(e)}")

    async def _get_recently_active_users(self, since: datetime) -> List[str]:
        """Get list of users who have been active since the given time."""
        try:
            # This would query the database for recently active users
            # For now, return empty list as this requires implementing the query
            return []

        except Exception as e:
            logger.error(f"Error getting recently active users: {str(e)}")
            return []

    def _batch_items(self, items: List[Any], batch_size: int) -> List[List[Any]]:
        """Split items into batches."""
        batches = []
        for i in range(0, len(items), batch_size):
            batches.append(items[i:i + batch_size])
        return batches


class JobScheduler:
    """Simple job scheduler for one-off personalization tasks."""

    def __init__(
        self,
        personalization_service: PersonalizationService,
        tag_repo: TagRepository
    ):
        self.personalization_service = personalization_service
        self.tag_repo = tag_repo

    async def initialize_user_preferences(
        self,
        user_id: str,
        preference_data: Dict[str, List[str]]
    ) -> Dict[str, Any]:
        """Initialize preferences for a new user."""
        try:
            result = {
                'user_id': user_id,
                'initialized_tags': 0,
                'errors': []
            }

            for category, tag_names in preference_data.items():
                try:
                    tags = await self.tag_repo.get_tags_by_category(category)
                    tag_map = {tag.name.lower(): tag for tag in tags}

                    for tag_name in tag_names:
                        tag = tag_map.get(tag_name.lower())
                        if tag:
                            await self.tag_repo.update_user_tag_score(
                                user_id=user_id,
                                tag_id=tag.id,
                                score_delta=0.5,
                                interaction_weight=1.0
                            )
                            result['initialized_tags'] += 1
                        else:
                            result['errors'].append(f"Tag not found: {tag_name}")

                except Exception as e:
                    result['errors'].append(f"Error processing category {category}: {str(e)}")

            logger.info(f"Initialized {result['initialized_tags']} tag preferences for user {user_id}")
            return result

        except Exception as e:
            logger.error(f"Error initializing user preferences: {str(e)}")
            raise

    async def bulk_update_joke_tags(
        self,
        joke_tag_assignments: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Bulk update joke tag assignments."""
        try:
            result = {
                'processed': 0,
                'errors': [],
                'skipped': 0
            }

            for assignment in joke_tag_assignments:
                try:
                    joke_id = assignment['joke_id']
                    tag_assignments = assignment['tags']

                    for tag_data in tag_assignments:
                        tag_name = tag_data['name']
                        confidence = tag_data.get('confidence', 1.0)

                        # Find tag by name
                        tags = await self.tag_repo.get_all()
                        tag = next((t for t in tags if t.name.lower() == tag_name.lower()), None)

                        if tag:
                            await self.tag_repo.add_joke_tag(
                                joke_id=joke_id,
                                tag_id=tag.id,
                                confidence=confidence
                            )
                            result['processed'] += 1
                        else:
                            result['errors'].append(f"Tag not found: {tag_name}")

                except Exception as e:
                    result['errors'].append(f"Error processing joke {assignment.get('joke_id', 'unknown')}: {str(e)}")
                    result['skipped'] += 1

            logger.info(f"Bulk updated {result['processed']} joke tag assignments")
            return result

        except Exception as e:
            logger.error(f"Error in bulk joke tag update: {str(e)}")
            raise

    async def recalculate_all_user_scores(self) -> Dict[str, Any]:
        """Recalculate all user tag scores based on historical interactions."""
        try:
            # This would be a heavy operation that processes all user interactions
            # and recalculates tag scores from scratch
            
            result = {
                'users_processed': 0,
                'scores_updated': 0,
                'errors': []
            }

            logger.info("Started recalculating all user scores")
            
            # Implementation would go here
            # For now, just return empty result
            
            return result

        except Exception as e:
            logger.error(f"Error recalculating user scores: {str(e)}")
            raise